import { createHash } from "node:crypto";

import { getDatabaseClient } from "./client";
import { loadDatabaseEnvConfig } from "./load-env";
import { replayStripeInboxEvent } from "./stripe-event-inbox";
import { replayOutboxJob } from "./transactional-outbox";

loadDatabaseEnvConfig();

const fail = (message: string): never => {
  throw new Error(message);
};

const main = async () => {
  const queue = process.env.DB_REPLAY_QUEUE?.trim() ?? "";
  const key = process.env.DB_REPLAY_KEY?.trim() ?? "";
  const confirmation = process.env.DB_REPLAY_CONFIRM?.trim() ?? "";

  if (queue !== "inbox" && queue !== "outbox") {
    fail("DB_REPLAY_QUEUE must be inbox or outbox.");
  }

  if (!key) {
    fail("DB_REPLAY_KEY is required.");
  }

  if (confirmation !== `${queue}:${key}`) {
    fail("DB_REPLAY_CONFIRM must exactly equal <queue>:<key>.");
  }

  const result =
    queue === "inbox"
      ? await replayStripeInboxEvent({ stripeEventId: key })
      : await replayOutboxJob({ deduplicationKey: key });

  console.warn(
    JSON.stringify(
      {
        attemptCount: result?.attemptCount ?? null,
        keyFingerprint: createHash("sha256").update(key).digest("hex"),
        queue,
        replayed: Boolean(result),
        status:
          result && "processingStatus" in result
            ? result.processingStatus
            : (result?.status ?? null),
      },
      null,
      2,
    ),
  );
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "durable_job_replay_failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await getDatabaseClient().end();
  });
