import assert from "node:assert/strict";
import test from "node:test";

import { scheduleStripeBackgroundJobs } from "./background-jobs";

test("registers the durable worker as an after-response task", async () => {
  let scheduledTask: (() => Promise<void>) | null = null;
  let runs = 0;
  const scheduled = scheduleStripeBackgroundJobs({
    run: async () => {
      runs += 1;

      return {
        inbox: {
          dead_letter: 0,
          empty: 1,
          processed: 0,
          retry: 0,
          sent: 0,
          skipped: 0,
        },
        outbox: {
          dead_letter: 0,
          empty: 1,
          processed: 0,
          retry: 0,
          sent: 0,
          skipped: 0,
        },
      };
    },
    schedule: (task) => {
      scheduledTask = task;
    },
  });

  assert.equal(scheduled, true);
  assert.equal(runs, 0);
  assert.ok(scheduledTask);
  await (scheduledTask as () => Promise<void>)();
  assert.equal(runs, 1);
});

test("keeps the acknowledgement path safe when the host rejects scheduling", () => {
  const scheduled = scheduleStripeBackgroundJobs({
    schedule: () => {
      throw new Error("request context unavailable");
    },
  });

  assert.equal(scheduled, false);
});
