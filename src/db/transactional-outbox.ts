import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { getDatabase } from "./client";
import { purchaseSideEffects } from "./schema";

export type OutboxJobKind = typeof purchaseSideEffects.$inferSelect.kind;
export type OutboxProvider = NonNullable<
  typeof purchaseSideEffects.$inferSelect.provider
>;
export type OutboxJobStatus = typeof purchaseSideEffects.$inferSelect.status;

export type ClaimedOutboxJob = {
  attemptCount: number;
  deduplicationKey: string;
  id: string;
  kind: OutboxJobKind;
  leaseToken: string;
  payload: Record<string, unknown>;
  provider: OutboxProvider | null;
  purchaseId: string | null;
  recipient: string | null;
};

export type EnqueueOutboxJobInput = {
  deduplicationKey: string;
  kind: OutboxJobKind;
  payload?: Record<string, unknown>;
  provider?: OutboxProvider | null;
  purchaseId?: string | null;
  recipient?: string | null;
};

type DatabaseTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

type OutboxExecutor = Pick<DatabaseTransaction, "insert" | "select">;

const OUTBOX_PAYLOAD_VERSION = 1;

const requireNonEmpty = (value: string, field: string) => {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error(`outbox_${field}_required`);
  }

  return normalizedValue;
};

const toClaimedOutboxJob = (
  row: typeof purchaseSideEffects.$inferSelect,
): ClaimedOutboxJob => {
  if (!row.leaseToken) {
    throw new Error("outbox_claim_missing_lease_token");
  }

  return {
    attemptCount: row.attemptCount,
    deduplicationKey: row.deduplicationKey,
    id: row.id,
    kind: row.kind,
    leaseToken: row.leaseToken,
    payload: row.payload,
    provider: row.provider,
    purchaseId: row.purchaseId,
    recipient: row.recipient,
  };
};

const enqueueWithExecutor = async (
  input: EnqueueOutboxJobInput,
  executor: OutboxExecutor,
) => {
  const deduplicationKey = requireNonEmpty(input.deduplicationKey, "deduplication_key");
  const [inserted] = await executor
    .insert(purchaseSideEffects)
    .values({
      deduplicationKey,
      kind: input.kind,
      payload: {
        ...(input.payload ?? {}),
        _outboxVersion: OUTBOX_PAYLOAD_VERSION,
      },
      provider: input.provider ?? null,
      purchaseId: input.purchaseId ?? null,
      recipient: input.recipient?.trim() || null,
      status: "pending",
    })
    .onConflictDoNothing({ target: purchaseSideEffects.deduplicationKey })
    .returning({
      id: purchaseSideEffects.id,
      status: purchaseSideEffects.status,
    });

  if (inserted) {
    return {
      duplicate: false,
      ...inserted,
    };
  }

  const [existing] = await executor
    .select({
      id: purchaseSideEffects.id,
      status: purchaseSideEffects.status,
    })
    .from(purchaseSideEffects)
    .where(eq(purchaseSideEffects.deduplicationKey, deduplicationKey))
    .limit(1);

  if (!existing) {
    throw new Error("outbox_duplicate_disappeared");
  }

  return {
    duplicate: true,
    ...existing,
  };
};

export const enqueueOutboxJob = (input: EnqueueOutboxJobInput) =>
  enqueueWithExecutor(input, getDatabase());

export const enqueueOutboxJobInTransaction = (
  transaction: DatabaseTransaction,
  input: EnqueueOutboxJobInput,
) => enqueueWithExecutor(input, transaction);

const claimOutboxJob = async ({
  deduplicationKey,
  kinds,
  leaseDurationMs = 2 * 60 * 1000,
  now = new Date(),
}: {
  deduplicationKey?: string;
  kinds?: OutboxJobKind[];
  leaseDurationMs?: number;
  now?: Date;
} = {}): Promise<ClaimedOutboxJob | null> => {
  if (!Number.isFinite(leaseDurationMs) || leaseDurationMs <= 0) {
    throw new Error("outbox_lease_duration_invalid");
  }

  const leaseToken = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

  return getDatabase().transaction(async (transaction) => {
    const [candidate] = await transaction
      .select({ id: purchaseSideEffects.id })
      .from(purchaseSideEffects)
      .where(
        and(
          sql`${purchaseSideEffects.payload} @> '{"_outboxVersion":1}'::jsonb`,
          deduplicationKey
            ? eq(purchaseSideEffects.deduplicationKey, deduplicationKey)
            : undefined,
          kinds?.length ? inArray(purchaseSideEffects.kind, kinds) : undefined,
          or(
            and(
              inArray(purchaseSideEffects.status, ["pending", "failed"]),
              or(
                isNull(purchaseSideEffects.nextAttemptAt),
                lte(purchaseSideEffects.nextAttemptAt, now),
              ),
            ),
            and(
              eq(purchaseSideEffects.status, "sending"),
              lte(purchaseSideEffects.leaseExpiresAt, now),
            ),
          ),
        ),
      )
      .orderBy(asc(purchaseSideEffects.createdAt), asc(purchaseSideEffects.id))
      .limit(1)
      .for("update", { skipLocked: true });

    if (!candidate) {
      return null;
    }

    const [claimed] = await transaction
      .update(purchaseSideEffects)
      .set({
        attemptCount: sql`${purchaseSideEffects.attemptCount} + 1`,
        failedAt: null,
        lastAttemptAt: now,
        lastErrorCode: null,
        lastErrorMessage: null,
        leaseExpiresAt,
        leaseToken,
        nextAttemptAt: null,
        status: "sending",
        updatedAt: now,
      })
      .where(eq(purchaseSideEffects.id, candidate.id))
      .returning();

    return claimed ? toClaimedOutboxJob(claimed) : null;
  });
};

export const claimNextOutboxJob = (
  options: {
    kinds?: OutboxJobKind[];
    leaseDurationMs?: number;
    now?: Date;
  } = {},
) => claimOutboxJob(options);

export const claimOutboxJobByDeduplicationKey = ({
  deduplicationKey,
  leaseDurationMs,
  now,
}: {
  deduplicationKey: string;
  leaseDurationMs?: number;
  now?: Date;
}) =>
  claimOutboxJob({
    deduplicationKey: requireNonEmpty(deduplicationKey, "deduplication_key"),
    leaseDurationMs,
    now,
  });

const markOutboxJobDelivered = async ({
  externalMessageId,
  job,
  now,
  skipped,
}: {
  externalMessageId?: string | null;
  job: ClaimedOutboxJob;
  now: Date;
  skipped: boolean;
}) => {
  const [updated] = await getDatabase()
    .update(purchaseSideEffects)
    .set({
      externalMessageId: externalMessageId?.trim() || null,
      leaseExpiresAt: null,
      leaseToken: null,
      sentAt: skipped ? null : now,
      status: skipped ? "skipped" : "sent",
      updatedAt: now,
    })
    .where(
      and(
        eq(purchaseSideEffects.id, job.id),
        eq(purchaseSideEffects.status, "sending"),
        eq(purchaseSideEffects.leaseToken, job.leaseToken),
      ),
    )
    .returning({ id: purchaseSideEffects.id });

  if (!updated) {
    throw new Error("outbox_delivery_lease_lost");
  }
};

const getRetryDelayMs = (attemptCount: number) =>
  Math.min(60 * 60 * 1000, 5_000 * 2 ** Math.max(0, attemptCount - 1));

const markOutboxJobFailed = async ({
  error,
  job,
  maxAttempts,
  now,
}: {
  error: unknown;
  job: ClaimedOutboxJob;
  maxAttempts: number;
  now: Date;
}) => {
  const retryable =
    !error || typeof error !== "object" || !("retryable" in error)
      ? true
      : error.retryable !== false;
  const deadLettered = !retryable || job.attemptCount >= maxAttempts;
  const errorCode =
    error && typeof error === "object" && "code" in error
      ? String(error.code).slice(0, 120)
      : "delivery_failed";
  const errorMessage =
    error instanceof Error ? error.message.slice(0, 1_000) : "Outbox delivery failed";
  const [updated] = await getDatabase()
    .update(purchaseSideEffects)
    .set({
      deadLetteredAt: deadLettered ? now : null,
      failedAt: now,
      lastErrorCode: errorCode,
      lastErrorMessage: errorMessage,
      leaseExpiresAt: null,
      leaseToken: null,
      nextAttemptAt: deadLettered
        ? null
        : new Date(now.getTime() + getRetryDelayMs(job.attemptCount)),
      status: deadLettered ? "dead_letter" : "failed",
      updatedAt: now,
    })
    .where(
      and(
        eq(purchaseSideEffects.id, job.id),
        eq(purchaseSideEffects.status, "sending"),
        eq(purchaseSideEffects.leaseToken, job.leaseToken),
      ),
    )
    .returning({ id: purchaseSideEffects.id });

  if (!updated) {
    throw new Error("outbox_failure_lease_lost");
  }

  return deadLettered;
};

export type OutboxDeliveryResult = {
  externalMessageId?: string | null;
  skipped?: boolean;
};

const processClaimedOutboxJob = async ({
  claim,
  deliver,
  maxAttempts = 8,
}: {
  claim: () => Promise<ClaimedOutboxJob | null>;
  deliver: (job: ClaimedOutboxJob) => Promise<OutboxDeliveryResult>;
  maxAttempts?: number;
}) => {
  if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) {
    throw new Error("outbox_max_attempts_invalid");
  }

  const job = await claim();

  if (!job) {
    return { status: "empty" as const };
  }

  try {
    // Provider I/O deliberately happens after the claim transaction committed. The
    // deterministic key must be forwarded as the provider idempotency key.
    const delivery = await deliver(job);
    await markOutboxJobDelivered({
      externalMessageId: delivery.externalMessageId,
      job,
      now: new Date(),
      skipped: delivery.skipped === true,
    });

    return {
      job,
      status: delivery.skipped ? ("skipped" as const) : ("sent" as const),
    };
  } catch (error) {
    const deadLettered = await markOutboxJobFailed({
      error,
      job,
      maxAttempts,
      now: new Date(),
    });

    return {
      error,
      job,
      status: deadLettered ? ("dead_letter" as const) : ("retry" as const),
    };
  }
};

export const processNextOutboxJob = ({
  deliver,
  kinds,
  maxAttempts = 8,
  now = new Date(),
}: {
  deliver: (job: ClaimedOutboxJob) => Promise<OutboxDeliveryResult>;
  kinds?: OutboxJobKind[];
  maxAttempts?: number;
  now?: Date;
}) =>
  processClaimedOutboxJob({
    claim: () => claimNextOutboxJob({ kinds, now }),
    deliver,
    maxAttempts,
  });

export const processOutboxJobByDeduplicationKey = ({
  deduplicationKey,
  deliver,
  maxAttempts = 8,
  now = new Date(),
}: {
  deduplicationKey: string;
  deliver: (job: ClaimedOutboxJob) => Promise<OutboxDeliveryResult>;
  maxAttempts?: number;
  now?: Date;
}) =>
  processClaimedOutboxJob({
    claim: () =>
      claimOutboxJobByDeduplicationKey({
        deduplicationKey,
        now,
      }),
    deliver,
    maxAttempts,
  });

export const replayOutboxJob = async ({
  deduplicationKey,
  now = new Date(),
}: {
  deduplicationKey: string;
  now?: Date;
}) => {
  const normalizedKey = requireNonEmpty(deduplicationKey, "deduplication_key");
  const [replayed] = await getDatabase()
    .update(purchaseSideEffects)
    .set({
      deadLetteredAt: null,
      failedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      leaseExpiresAt: null,
      leaseToken: null,
      nextAttemptAt: null,
      status: "pending",
      updatedAt: now,
    })
    .where(
      and(
        eq(purchaseSideEffects.deduplicationKey, normalizedKey),
        inArray(purchaseSideEffects.status, ["failed", "dead_letter"]),
      ),
    )
    .returning({
      attemptCount: purchaseSideEffects.attemptCount,
      id: purchaseSideEffects.id,
      status: purchaseSideEffects.status,
    });

  return replayed ?? null;
};
