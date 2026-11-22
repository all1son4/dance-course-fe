import { after } from "next/server";

import { processNextOutboxJob } from "@/db/transactional-outbox";
import { logSafeError } from "@/lib/safe-error-log";
import { getStripeServer } from "@/lib/stripe-checkout";

import { processNextStripeWebhookInboxJob } from "./inbox-worker";
import { deliverStripeOutboxJob, STRIPE_OUTBOX_KINDS } from "./outbox-delivery";

type WorkerStatus = "dead_letter" | "empty" | "processed" | "retry" | "sent" | "skipped";

type WorkerCounts = Record<WorkerStatus, number>;

const createWorkerCounts = (): WorkerCounts => ({
  dead_letter: 0,
  empty: 0,
  processed: 0,
  retry: 0,
  sent: 0,
  skipped: 0,
});

const increment = (counts: WorkerCounts, status: WorkerStatus) => {
  counts[status] += 1;
};

const hasRetry = (result: Awaited<ReturnType<typeof runStripeBackgroundJobs>>) =>
  result.inbox.retry > 0 || result.outbox.retry > 0;

const wait = (delayMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });

export const runStripeBackgroundJobs = async ({
  inboxLimit = 8,
  outboxLimit = 16,
}: {
  inboxLimit?: number;
  outboxLimit?: number;
} = {}) => {
  const stripe = getStripeServer();

  if (!stripe) {
    throw new Error("stripe_background_worker_missing_secret_key");
  }

  const inbox = createWorkerCounts();
  const outbox = createWorkerCounts();

  for (let index = 0; index < inboxLimit; index += 1) {
    const result = await processNextStripeWebhookInboxJob({ stripe });
    increment(inbox, result.status);

    if (result.status === "empty") {
      break;
    }
  }

  // The admin alert renders the email/access outcome, so the registry order
  // (email first, alert second) doubles as the delivery order: each kind is
  // drained fully before the next one starts.
  for (const kind of STRIPE_OUTBOX_KINDS) {
    for (let index = 0; index < outboxLimit; index += 1) {
      const result = await processNextOutboxJob({
        deliver: (job) => deliverStripeOutboxJob({ job, stripe }),
        kinds: [kind],
      });
      increment(outbox, result.status);

      if (result.status === "empty") {
        break;
      }
    }
  }

  return { inbox, outbox };
};

export const scheduleStripeBackgroundJobs = ({
  run = runStripeBackgroundJobs,
  schedule = after,
}: {
  run?: typeof runStripeBackgroundJobs;
  schedule?: (task: () => Promise<void>) => void;
} = {}): boolean => {
  try {
    schedule(async () => {
      try {
        if (hasRetry(await run())) {
          // The first repository backoff is five seconds. One bounded second pass
          // handles ordinary transient failures while staying inside the route's
          // 60-second after() budget; later webhooks and daily recovery handle more.
          await wait(5_500);
          await run();
        }
      } catch (error) {
        logSafeError("Stripe background jobs failed", error);
      }
    });

    return true;
  } catch (error) {
    // The inbox row is already durable. A later webhook, status poll, manual run, or
    // daily recovery can safely claim it if the hosting runtime rejects scheduling.
    logSafeError("Failed to schedule Stripe background jobs", error);

    return false;
  }
};
