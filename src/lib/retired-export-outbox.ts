import { type ClaimedOutboxJob, processNextOutboxJob } from "@/db/transactional-outbox";

// Keep durable history and a bounded drain for jobs left by older deployments.
// This is not an exporter: no flag, provider client, or customer projection is read.
export const RETIRED_EXPORT_OUTBOX_KINDS = ["successful_customer_export"] as const;

export const skipRetiredExportOutboxJob = async (job: ClaimedOutboxJob) => {
  if (job.kind !== "successful_customer_export") {
    throw Object.assign(new Error("retired_export_kind_unsupported"), {
      retryable: false,
    });
  }

  return { skipped: true };
};

export const runRetiredExportOutboxJobs = async ({
  limit = 16,
}: {
  limit?: number;
} = {}) => {
  const counts = {
    dead_letter: 0,
    empty: 0,
    retry: 0,
    sent: 0,
    skipped: 0,
  };

  for (let index = 0; index < limit; index += 1) {
    const result = await processNextOutboxJob({
      deliver: skipRetiredExportOutboxJob,
      kinds: [...RETIRED_EXPORT_OUTBOX_KINDS],
    });

    counts[result.status] += 1;

    if (result.status === "empty") {
      break;
    }
  }

  return counts;
};
