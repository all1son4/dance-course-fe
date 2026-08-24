import { getStripeServer } from "@/app/api/stripe/payment-intent/lib";
import { runStripeBackgroundJobs } from "@/app/api/stripe/webhook/_lib/background-jobs";
import {
  deliverStripeOutboxJob,
  STRIPE_OUTBOX_KINDS,
} from "@/app/api/stripe/webhook/_lib/outbox-delivery";
import {
  findOutboxJobKindByDeduplicationKey,
  findOutboxJobStatusByDeduplicationKey,
  findStripeInboxEventReplayState,
} from "@/db/admin-operations";
import { replayStripeInboxEvent } from "@/db/stripe-event-inbox";
import {
  processOutboxJobByDeduplicationKey,
  replayOutboxJob,
} from "@/db/transactional-outbox";
import { isAdminInviteLinksRequestAuthenticated } from "@/lib/admin-invite-links-auth";
import {
  BUSINESS_OPERATION_OUTBOX_KINDS,
  processBusinessOperationOutboxJob,
} from "@/lib/business-operation-outbox";
import {
  getBrowserJsonRequestErrorResponse,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import { consumeRequestRateLimit } from "@/lib/rate-limit";
import {
  runSheetsExportOutboxJobs,
  SHEETS_EXPORT_OUTBOX_KINDS,
} from "@/lib/sheets-export-outbox";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 4 * 1024;

type ReplayBody = {
  key?: unknown;
  queue?: unknown;
};

// Each set comes from the module that actually processes the kind; a kind
// outside all three has no worker, so replaying it would only strand the row.
const STRIPE_KIND_SET = new Set<string>(STRIPE_OUTBOX_KINDS);
const SHEETS_KIND_SET = new Set<string>(SHEETS_EXPORT_OUTBOX_KINDS);
const BUSINESS_KIND_SET = new Set<string>(BUSINESS_OPERATION_OUTBOX_KINDS);

const isReplayableOutboxKind = (kind: string) =>
  STRIPE_KIND_SET.has(kind) || SHEETS_KIND_SET.has(kind) || BUSINESS_KIND_SET.has(kind);

const drainReplayedOutboxJob = async ({
  deduplicationKey,
  kind,
}: {
  deduplicationKey: string;
  kind: string;
}) => {
  if (STRIPE_KIND_SET.has(kind)) {
    const stripe = getStripeServer();

    if (!stripe) {
      throw new Error("stripe_not_configured_for_replay_drain");
    }

    await processOutboxJobByDeduplicationKey({
      deduplicationKey,
      deliver: (job) => deliverStripeOutboxJob({ job, stripe }),
    });
    return;
  }

  if (SHEETS_KIND_SET.has(kind)) {
    await runSheetsExportOutboxJobs({ limit: 4 });
    return;
  }

  await processBusinessOperationOutboxJob(deduplicationKey);
};

export async function POST(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonNoStore({ errorCode: "unauthorized" }, { status: 401 });
  }

  const requestErrorResponse = getBrowserJsonRequestErrorResponse(
    request,
    MAX_BODY_BYTES,
  );

  if (requestErrorResponse) {
    return requestErrorResponse;
  }

  const rateLimit = await consumeRequestRateLimit({
    keyPrefix: "admin:operations-replay",
    limit: 10,
    request,
    windowMs: 60_000,
  });

  if (rateLimit.limited) {
    return jsonNoStore(
      { errorCode: "rate_limited" },
      {
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        status: 429,
      },
    );
  }

  try {
    const body = await parseJsonBody<ReplayBody>(request);
    const queue = body?.queue === "inbox" || body?.queue === "outbox" ? body.queue : "";
    const key = typeof body?.key === "string" ? body.key.trim() : "";

    if (!queue || !key) {
      return jsonNoStore({ errorCode: "invalid_request_body" }, { status: 400 });
    }

    // Refuse before touching the row: replay wipes the stored diagnostics, so
    // a job no worker can process must keep its dead-letter state intact.
    let outboxKind = "";

    if (queue === "inbox") {
      const eventState = await findStripeInboxEventReplayState(key);

      if (!eventState) {
        return jsonNoStore({ errorCode: "replay_job_not_found" }, { status: 404 });
      }

      if (!eventState.providerPayloadVerified) {
        return jsonNoStore({ errorCode: "replay_event_not_verified" }, { status: 409 });
      }
    } else {
      const kind = await findOutboxJobKindByDeduplicationKey(key);

      if (!kind) {
        return jsonNoStore({ errorCode: "replay_job_not_found" }, { status: 404 });
      }

      if (!isReplayableOutboxKind(kind)) {
        return jsonNoStore({ errorCode: "replay_kind_unsupported" }, { status: 409 });
      }

      outboxKind = kind;
    }

    const replayed =
      queue === "inbox"
        ? await replayStripeInboxEvent({ stripeEventId: key })
        : await replayOutboxJob({ deduplicationKey: key });

    if (!replayed) {
      return jsonNoStore({ errorCode: "replay_job_not_found" }, { status: 404 });
    }

    // The replay only re-queues the row; a bounded drain right away gives the
    // admin an immediate answer instead of waiting for the next webhook or cron.
    try {
      if (queue === "inbox") {
        await runStripeBackgroundJobs({ inboxLimit: 4, outboxLimit: 8 });
      } else {
        await drainReplayedOutboxJob({ deduplicationKey: key, kind: outboxKind });
      }
    } catch (drainError) {
      // The row is durable and pending; the next webhook or the daily cron
      // will pick it up even though this immediate attempt failed.
      console.error("Failed to drain queue after admin replay", {
        error: drainError,
        queue,
      });
    }

    const status =
      queue === "inbox"
        ? ((await findStripeInboxEventReplayState(key))?.processingStatus ?? "pending")
        : ((await findOutboxJobStatusByDeduplicationKey(key)) ?? "pending");

    return jsonNoStore({ status });
  } catch (error) {
    console.error("Failed to replay durable job from admin", error);
    return jsonNoStore({ errorCode: "replay_failed" }, { status: 500 });
  }
}
