import assert from "node:assert/strict";
import test from "node:test";

import { getCheckoutBlockReason } from "@/app/[locale]/payment/payment.helpers";

const FLAGS = [
  "isCatalogUnavailable",
  "isStaleCheckoutLink",
  "isSalesClosed",
  "isRenewalUnavailable",
] as const;
const REASONS = [
  "catalog_unavailable",
  "stale_link",
  "sales_closed",
  "renewal_unavailable",
];

test("the checkout is blocked by the first true reason, in notice order", () => {
  // Every combination of the four flags: the earliest one set wins.
  for (let mask = 0; mask < 16; mask += 1) {
    const flags = Object.fromEntries(
      FLAGS.map((flag, index) => [flag, Boolean(mask & (1 << index))]),
    ) as Record<(typeof FLAGS)[number], boolean>;
    const first = FLAGS.findIndex((flag) => flags[flag]);

    assert.equal(
      getCheckoutBlockReason(flags),
      first === -1 ? null : REASONS[first],
      JSON.stringify(flags),
    );
  }
});
