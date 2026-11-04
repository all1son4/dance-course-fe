import assert from "node:assert/strict";
import test from "node:test";

import { BIRTHDAY_DROP_OFFER_ID, SELLABLE_PRODUCTS } from "@/constants/sellable-products";

import {
  type ChoreoReminderBinding,
  planChoreoAccessReminders,
} from "./choreo-access-reminders";

const NOW = new Date("2026-11-04T03:00:00Z");
const OFFER = SELLABLE_PRODUCTS["choreo-her-lies"].offers[0].id;
const fixture = (
  overrides: Partial<ChoreoReminderBinding> = {},
): ChoreoReminderBinding => ({
  bindingId: "binding-1",
  chatId: "-100123",
  telegramUserId: "user-1",
  boundAt: new Date("2026-09-19T18:00:00Z"),
  expiresAt: new Date("2026-11-18T18:00:00Z"),
  offerId: OFFER,
  email: "Buyer@Example.com",
  locale: "ru",
  lessonLanguage: "ru",
  productTitle: "Her Lies",
  amountMinor: 6500,
  source: "stripe",
  livemode: true,
  ...overrides,
});
const plan = (bindings: ChoreoReminderBinding[], now = NOW) =>
  planChoreoAccessReminders({ bindings, now, livemode: true });

test("schedules paid active choreography access on its 14th Warsaw calendar day", () => {
  const [reminder] = plan([fixture()]);
  assert.equal(reminder.email, "buyer@example.com");
  assert.equal(reminder.expiresAt.toISOString(), "2026-11-18T18:00:00.000Z");
  assert.deepEqual(plan([fixture({ expiresAt: new Date("2026-11-19T00:00:00Z") })]), []);
  assert.deepEqual(plan([fixture({ expiresAt: NOW })]), []);
  // A missed run may catch up while the access is still active; the email uses the actual date.
  assert.equal(plan([fixture()], new Date("2026-11-17T03:00:00Z")).length, 1);
});

test("uses calendar days correctly across the daylight-saving change", () => {
  const now = new Date("2026-10-16T03:00:00Z");
  assert.equal(
    plan(
      [
        fixture({
          boundAt: new Date("2026-09-01T00:00:00Z"),
          expiresAt: new Date("2026-10-30T22:30:00Z"),
        }),
      ],
      now,
    ).length,
    1,
  );
  assert.equal(
    plan([fixture({ expiresAt: new Date("2026-10-30T23:30:00Z") })], now).length,
    0,
  );
});

test("excludes courses, lifetime offers, free grants, test purchases, and unstarted access", () => {
  for (const overrides of [
    { offerId: SELLABLE_PRODUCTS["first-touch"].offers[0].id },
    { offerId: SELLABLE_PRODUCTS["online-group-anna-strok"].offers[0].id },
    { offerId: BIRTHDAY_DROP_OFFER_ID, expiresAt: null },
    { amountMinor: 0 },
    { source: "admin_offer_link" },
    { livemode: false },
    { email: "" },
    { boundAt: new Date("2026-12-01T00:00:00Z") },
  ])
    assert.deepEqual(plan([fixture(overrides)]), []);
});

test("uses the longest current access and avoids duplicate reminders for repeat purchases", () => {
  const original = fixture();
  const extension = fixture({
    bindingId: "binding-2",
    expiresAt: new Date("2026-12-04T18:00:00Z"),
    amountMinor: 0,
    source: "admin_offer_link",
  });
  assert.deepEqual(plan([original, extension]), []);
  const sameExpiry = fixture({ bindingId: "binding-3" });
  assert.equal(plan([original, sameExpiry]).length, 1);
  assert.equal(
    plan([original])[0].deduplicationKey,
    plan([sameExpiry, original])[0].deduplicationKey,
  );
  const later = plan([extension, original], new Date("2026-11-20T03:00:00Z"))[0];
  assert.notEqual(later.deduplicationKey, plan([original])[0].deduplicationKey);
  assert.deepEqual(
    plan([
      original,
      fixture({
        bindingId: "lifetime",
        offerId: BIRTHDAY_DROP_OFFER_ID,
        expiresAt: null,
      }),
    ]),
    [],
  );
});

test("keeps independently purchased channels separate and supports historical expiry fallback", () => {
  assert.equal(
    plan([fixture(), fixture({ bindingId: "other", chatId: "-100456" })]).length,
    2,
  );
  assert.equal(
    plan([fixture({ expiresAt: null })])[0].expiresAt.toISOString(),
    fixture().expiresAt!.toISOString(),
  );
});
