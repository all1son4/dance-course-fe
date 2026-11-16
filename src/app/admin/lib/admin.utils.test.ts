import assert from "node:assert/strict";
import test from "node:test";

import {
  formatDateTimeInput,
  parseWarsawDateTimeInput,
} from "@/app/admin/lib/admin.utils";

// The admin form says «По Варшаве»: the value must not depend on the device's zone.
test("a cohort start typed as Warsaw time is the same moment on every device", () => {
  assert.equal(parseWarsawDateTimeInput("2026-11-23T18:00"), "2026-11-23T17:00:00.000Z");
  assert.equal(parseWarsawDateTimeInput("2026-07-01T18:00"), "2026-07-01T16:00:00.000Z");
  assert.equal(parseWarsawDateTimeInput("not a date"), "");
});

test("a stored start is shown back in Warsaw time", () => {
  assert.equal(formatDateTimeInput("2026-11-23T17:00:00.000Z"), "2026-11-23T18:00");
  assert.equal(formatDateTimeInput("2026-08-10T06:00:00.000Z"), "2026-08-10T08:00");
  assert.equal(formatDateTimeInput("garbage"), "");
});
