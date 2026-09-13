import assert from "node:assert/strict";
import test from "node:test";

import { getScheduledPolishTerminalReminderPeriod } from "@/lib/polish-terminal-sales";

test("opens the Polish terminal reminder seven days before a 30-day month ends", () => {
  assert.equal(
    getScheduledPolishTerminalReminderPeriod(new Date("2026-09-22T21:59:59.999Z")),
    null,
  );
  assert.deepEqual(
    getScheduledPolishTerminalReminderPeriod(new Date("2026-09-22T22:00:01.000Z")),
    {
      endUtcIso: "2026-09-30T22:00:00.000Z",
      monthValue: "2026-09",
      reminderDateValue: "2026-09-23",
      startUtcIso: "2026-08-31T22:00:00.000Z",
    },
  );
});

test("uses the last calendar day for 31-day and February reminder dates", () => {
  assert.equal(
    getScheduledPolishTerminalReminderPeriod(new Date("2026-10-23T21:59:59.999Z")),
    null,
  );
  assert.equal(
    getScheduledPolishTerminalReminderPeriod(new Date("2026-10-23T22:00:00.000Z"))
      ?.reminderDateValue,
    "2026-10-24",
  );
  assert.equal(
    getScheduledPolishTerminalReminderPeriod(new Date("2028-02-21T23:00:00.000Z"))
      ?.reminderDateValue,
    "2028-02-22",
  );
});

test("keeps the reminder window open so a missed daily run can recover once", () => {
  assert.equal(
    getScheduledPolishTerminalReminderPeriod(new Date("2026-09-29T03:00:00.000Z"))
      ?.monthValue,
    "2026-09",
  );
  assert.equal(
    getScheduledPolishTerminalReminderPeriod(new Date("2026-10-01T03:00:00.000Z")),
    null,
  );
});
