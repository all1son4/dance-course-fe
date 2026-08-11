import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { getDatabase } from "./client";
import { stripeEvents } from "./schema";

export type VerifiedStripeInboxEvent = {
  apiVersion: string | null;
  eventType: string;
  livemode: boolean;
  payload: Record<string, unknown>;
  receivedAt?: Date;
  stripeCreatedAt: Date;
  stripeEventId: string;
};

export type StripeInboxReceipt = {
  duplicate: boolean;
  id: string;
  processingStatus:
    | "pending"
    | "processing"
    | "processed"
    | "skipped"
    | "failed"
    | "dead_letter";
};

export type ClaimedStripeInboxEvent = {
  apiVersion: string | null;
  attemptCount: number;
  eventType: string;
  id: string;
  leaseToken: string;
  livemode: boolean;
  payload: Record<string, unknown>;
  receivedAt: Date;
  stripeCreatedAt: Date;
  stripeEventId: string;
};

type DatabaseTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

export type StripeInboxProjectionResult = {
  outcomeSnapshot?: string | null;
  paymentIntentId?: string | null;
  paymentStatusSnapshot?: string | null;
  purchaseId?: string | null;
  skipped?: boolean;
};

const requireNonEmpty = (value: string, field: string) => {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error(`stripe_inbox_${field}_required`);
  }

  return normalizedValue;
};

export const recordVerifiedStripeEvent = async (
  event: VerifiedStripeInboxEvent,
): Promise<StripeInboxReceipt> => {
  const stripeEventId = requireNonEmpty(event.stripeEventId, "event_id");
  const eventType = requireNonEmpty(event.eventType, "event_type");
  const db = getDatabase();
  const [inserted] = await db
    .insert(stripeEvents)
    .values({
      apiVersion: event.apiVersion,
      eventType,
      livemode: event.livemode,
      payload: event.payload,
      processingStatus: "pending",
      providerPayloadVerified: true,
      receivedAt: event.receivedAt ?? new Date(),
      stripeCreatedAt: event.stripeCreatedAt,
      stripeEventId,
    })
    .onConflictDoNothing({ target: stripeEvents.stripeEventId })
    .returning({
      id: stripeEvents.id,
      processingStatus: stripeEvents.processingStatus,
    });

  if (inserted) {
    return {
      duplicate: false,
      ...inserted,
    };
  }

  const [existing] = await db
    .select({
      id: stripeEvents.id,
      processingStatus: stripeEvents.processingStatus,
      providerPayloadVerified: stripeEvents.providerPayloadVerified,
    })
    .from(stripeEvents)
    .where(eq(stripeEvents.stripeEventId, stripeEventId))
    .limit(1);

  if (!existing) {
    throw new Error("stripe_inbox_duplicate_disappeared");
  }

  if (!existing.providerPayloadVerified) {
    const [promoted] = await db
      .update(stripeEvents)
      .set({
        apiVersion: event.apiVersion,
        eventType,
        livemode: event.livemode,
        payload: event.payload,
        providerPayloadVerified: true,
        stripeCreatedAt: event.stripeCreatedAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(stripeEvents.id, existing.id),
          eq(stripeEvents.providerPayloadVerified, false),
        ),
      )
      .returning({
        id: stripeEvents.id,
        processingStatus: stripeEvents.processingStatus,
      });

    if (promoted) {
      return {
        duplicate: true,
        ...promoted,
      };
    }

    const [concurrentlyPromoted] = await db
      .select({
        id: stripeEvents.id,
        processingStatus: stripeEvents.processingStatus,
      })
      .from(stripeEvents)
      .where(eq(stripeEvents.id, existing.id))
      .limit(1);

    if (!concurrentlyPromoted) {
      throw new Error("stripe_inbox_duplicate_disappeared");
    }

    return {
      duplicate: true,
      ...concurrentlyPromoted,
    };
  }

  return {
    duplicate: true,
    ...existing,
  };
};

const toClaimedStripeInboxEvent = (
  row: typeof stripeEvents.$inferSelect,
): ClaimedStripeInboxEvent => {
  if (!row.leaseToken || !row.stripeCreatedAt) {
    throw new Error("stripe_inbox_claim_invalid");
  }

  return {
    apiVersion: row.apiVersion,
    attemptCount: row.attemptCount,
    eventType: row.eventType,
    id: row.id,
    leaseToken: row.leaseToken,
    livemode: row.livemode,
    payload: row.payload,
    receivedAt: row.receivedAt,
    stripeCreatedAt: row.stripeCreatedAt,
    stripeEventId: row.stripeEventId,
  };
};

export const claimNextStripeInboxEvent = async ({
  eventTypes,
  leaseDurationMs = 2 * 60 * 1000,
  now = new Date(),
}: {
  eventTypes?: string[];
  leaseDurationMs?: number;
  now?: Date;
} = {}): Promise<ClaimedStripeInboxEvent | null> => {
  if (!Number.isFinite(leaseDurationMs) || leaseDurationMs <= 0) {
    throw new Error("stripe_inbox_lease_duration_invalid");
  }

  const leaseToken = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

  return getDatabase().transaction(async (transaction) => {
    const [candidate] = await transaction
      .select({ id: stripeEvents.id })
      .from(stripeEvents)
      .where(
        and(
          eq(stripeEvents.providerPayloadVerified, true),
          eventTypes?.length ? inArray(stripeEvents.eventType, eventTypes) : undefined,
          or(
            and(
              inArray(stripeEvents.processingStatus, ["pending", "failed"]),
              or(
                isNull(stripeEvents.nextAttemptAt),
                lte(stripeEvents.nextAttemptAt, now),
              ),
            ),
            and(
              eq(stripeEvents.processingStatus, "processing"),
              lte(stripeEvents.leaseExpiresAt, now),
            ),
          ),
        ),
      )
      .orderBy(asc(stripeEvents.receivedAt), asc(stripeEvents.id))
      .limit(1)
      .for("update", { skipLocked: true });

    if (!candidate) {
      return null;
    }

    const [claimed] = await transaction
      .update(stripeEvents)
      .set({
        attemptCount: sql`${stripeEvents.attemptCount} + 1`,
        errorCode: null,
        errorMessage: null,
        lastAttemptAt: now,
        leaseExpiresAt,
        leaseToken,
        nextAttemptAt: null,
        processingStatus: "processing",
        updatedAt: now,
      })
      .where(eq(stripeEvents.id, candidate.id))
      .returning();

    return claimed ? toClaimedStripeInboxEvent(claimed) : null;
  });
};

const getRetryDelayMs = (attemptCount: number) =>
  Math.min(60 * 60 * 1000, 5_000 * 2 ** Math.max(0, attemptCount - 1));

const markStripeInboxEventFailed = async ({
  error,
  event,
  maxAttempts,
  now,
}: {
  error: unknown;
  event: ClaimedStripeInboxEvent;
  maxAttempts: number;
  now: Date;
}) => {
  const deadLettered = event.attemptCount >= maxAttempts;
  const errorCode =
    error && typeof error === "object" && "code" in error
      ? String(error.code).slice(0, 120)
      : "projection_failed";
  const errorMessage =
    error instanceof Error ? error.message.slice(0, 1_000) : "Projection failed";
  const [updated] = await getDatabase()
    .update(stripeEvents)
    .set({
      deadLetteredAt: deadLettered ? now : null,
      errorCode,
      errorMessage,
      leaseExpiresAt: null,
      leaseToken: null,
      nextAttemptAt: deadLettered
        ? null
        : new Date(now.getTime() + getRetryDelayMs(event.attemptCount)),
      processingStatus: deadLettered ? "dead_letter" : "failed",
      updatedAt: now,
    })
    .where(
      and(
        eq(stripeEvents.id, event.id),
        eq(stripeEvents.processingStatus, "processing"),
        eq(stripeEvents.leaseToken, event.leaseToken),
      ),
    )
    .returning({ id: stripeEvents.id });

  if (!updated) {
    throw new Error("stripe_inbox_failure_lease_lost");
  }

  return deadLettered;
};

export const processNextStripeInboxEvent = async <Prepared = undefined>({
  eventTypes,
  maxAttempts = 8,
  now = new Date(),
  prepare,
  project,
}: {
  eventTypes?: string[];
  maxAttempts?: number;
  now?: Date;
  prepare?: (event: ClaimedStripeInboxEvent) => Promise<Prepared>;
  project: (input: {
    event: ClaimedStripeInboxEvent;
    prepared: Prepared;
    transaction: DatabaseTransaction;
  }) => Promise<StripeInboxProjectionResult>;
}) => {
  if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) {
    throw new Error("stripe_inbox_max_attempts_invalid");
  }

  const event = await claimNextStripeInboxEvent({ eventTypes, now });

  if (!event) {
    return { status: "empty" as const };
  }

  try {
    // Provider enrichment happens after the short claim transaction and before the
    // atomic projection transaction. It must never keep database locks open.
    const prepared = prepare ? await prepare(event) : (undefined as Prepared);
    const projection = await getDatabase().transaction(async (transaction) => {
      const result = await project({ event, prepared, transaction });
      const completedAt = new Date();
      const [updated] = await transaction
        .update(stripeEvents)
        .set({
          leaseExpiresAt: null,
          leaseToken: null,
          outcomeSnapshot: result.outcomeSnapshot ?? null,
          paymentIntentId: result.paymentIntentId ?? null,
          paymentStatusSnapshot: result.paymentStatusSnapshot ?? null,
          processedAt: completedAt,
          processingStatus: result.skipped ? "skipped" : "processed",
          purchaseId: result.purchaseId ?? null,
          updatedAt: completedAt,
        })
        .where(
          and(
            eq(stripeEvents.id, event.id),
            eq(stripeEvents.processingStatus, "processing"),
            eq(stripeEvents.leaseToken, event.leaseToken),
          ),
        )
        .returning({ id: stripeEvents.id });

      if (!updated) {
        throw new Error("stripe_inbox_projection_lease_lost");
      }

      return result;
    });

    return {
      event,
      projection,
      status: projection.skipped ? ("skipped" as const) : ("processed" as const),
    };
  } catch (error) {
    const deadLettered = await markStripeInboxEventFailed({
      error,
      event,
      maxAttempts,
      now: new Date(),
    });

    return {
      error,
      event,
      status: deadLettered ? ("dead_letter" as const) : ("retry" as const),
    };
  }
};

export const replayStripeInboxEvent = async ({
  now = new Date(),
  stripeEventId,
}: {
  now?: Date;
  stripeEventId: string;
}) => {
  const normalizedEventId = requireNonEmpty(stripeEventId, "event_id");
  const [replayed] = await getDatabase()
    .update(stripeEvents)
    .set({
      deadLetteredAt: null,
      errorCode: null,
      errorMessage: null,
      leaseExpiresAt: null,
      leaseToken: null,
      nextAttemptAt: null,
      processingStatus: "pending",
      updatedAt: now,
    })
    .where(
      and(
        eq(stripeEvents.stripeEventId, normalizedEventId),
        inArray(stripeEvents.processingStatus, ["failed", "dead_letter"]),
      ),
    )
    .returning({
      attemptCount: stripeEvents.attemptCount,
      id: stripeEvents.id,
      processingStatus: stripeEvents.processingStatus,
    });

  return replayed ?? null;
};
