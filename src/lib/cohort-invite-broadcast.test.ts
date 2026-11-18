import assert from "node:assert/strict";
import test from "node:test";

import type { CohortInviteAudienceRow } from "@/db/cohort-invite-broadcast";

import {
  checkBatchSize,
  checkCohortInviteAddresses,
  chooseCohortInviteLinks,
  classifyCohortInviteAudience,
  getRemainingToday,
  parseAddressList,
  PURCHASE_EMAIL_RESERVE,
  RESEND_DAILY_LIMIT,
  resolveCohortInviteLocale,
} from "./cohort-invite-broadcast";

const row = (overrides: Partial<CohortInviteAudienceRow>): CohortInviteAudienceRow => ({
  blocked: false,
  campaignStatus: null,
  customerId: null,
  email: "buyer@example.com",
  fullName: "",
  hubActive: false,
  locale: "en",
  paidCurrentCohort: false,
  paidPreviousCohort: false,
  standaloneHubActive: false,
  ...overrides,
});

test("the audience leaves out buyers of the cohort on sale, a running standalone Hub, blocks and done rows", () => {
  const { counts, recipients } = classifyCohortInviteAudience([
    row({ email: "new@example.com" }),
    row({ email: "paid@example.com", paidCurrentCohort: true }),
    row({ email: "hub@example.com", hubActive: true, standaloneHubActive: true }),
    // A Hub left over from Plus does not exclude.
    row({ email: "plus-tail@example.com", hubActive: true, paidPreviousCohort: true }),
    row({ blocked: true, email: "blocked@example.com" }),
    row({ campaignStatus: "excluded", email: "excluded@example.com" }),
    row({ campaignStatus: "sent", email: "sent@example.com" }),
    row({ campaignStatus: "sending", email: "sending@example.com" }),
    row({ campaignStatus: "failed", email: "failed@example.com" }),
    row({ campaignStatus: "pending", email: "pending@example.com" }),
  ]);

  assert.deepEqual(
    recipients.map((recipient) => recipient.email),
    [
      "plus-tail@example.com",
      "failed@example.com",
      "new@example.com",
      "pending@example.com",
    ],
  );
  assert.deepEqual(counts, {
    alreadyBought: 2,
    excluded: 2,
    failed: 1,
    inProgress: 1,
    remaining: 4,
    sent: 1,
  });
});

test("a sent row stays sent even after its address bought the cohort", () => {
  const { counts } = classifyCohortInviteAudience([
    row({ campaignStatus: "sent", paidCurrentCohort: true }),
  ]);
  assert.equal(counts.sent, 1);
  assert.equal(counts.alreadyBought, 0);
});

test("the language is the latest purchase's, English when it is empty or unknown", () => {
  assert.equal(resolveCohortInviteLocale("ru"), "ru");
  assert.equal(resolveCohortInviteLocale(" PL "), "pl");
  assert.equal(resolveCohortInviteLocale("en"), "en");
  assert.equal(resolveCohortInviteLocale(null), "en");
  assert.equal(resolveCohortInviteLocale(""), "en");
  assert.equal(resolveCohortInviteLocale("de"), "en");
});

const renewal = { plus: "renew-plus-3", standard: "renew-standard-3" };
const pathOf = (href: string | null) => {
  if (!href) return null;
  const url = new URL(href);
  return `${url.pathname}${url.searchParams.get("renewal") ? `?renewal=${url.searchParams.get("renewal")}` : ""}`;
};

test("a previous-cohort member gets the renewals and, while her Hub runs, the Hub special price", () => {
  const links = chooseCohortInviteLinks({
    campaignKey: "cohort_invite:c3",
    hubOnSale: true,
    myAccessUrl: "https://example.com/pl/access?t=abc",
    recipient: { hubActive: true, locale: "pl", paidPreviousCohort: true },
    renewal,
  });

  assert.equal(links.kind, "renewal");
  assert.equal(pathOf(links.standard), "/pl/payment?renewal=renew-standard-3");
  assert.equal(pathOf(links.plus), "/pl/payment?renewal=renew-plus-3");
  assert.equal(pathOf(links.hub), "/pl/payment?renewal=inspiration-hub");
  assert.equal(links.hubSpecialPrice, true);

  const standard = new URL(links.standard);
  assert.equal(standard.searchParams.get("utm_medium"), "email");
  assert.equal(standard.searchParams.get("utm_campaign"), "cohort_invite:c3");
  assert.equal(standard.searchParams.get("utm_content"), "standard");
  assert.equal(new URL(links.hub!).searchParams.get("utm_content"), "hub_only");
  assert.equal(new URL(links.myAccess!).searchParams.get("t"), "abc");
  assert.equal(new URL(links.myAccess!).searchParams.get("utm_content"), "my_access");
});

test("a previous-cohort member whose Hub ended gets the Hub page", () => {
  const links = chooseCohortInviteLinks({
    campaignKey: "k",
    hubOnSale: true,
    recipient: { hubActive: false, locale: "en", paidPreviousCohort: true },
    renewal,
  });
  assert.equal(pathOf(links.hub), "/en/online/inspiration-hub");
  assert.equal(links.hubSpecialPrice, false);
});

test("everyone else gets the product pages, even with a running Hub", () => {
  const links = chooseCohortInviteLinks({
    campaignKey: "k",
    hubOnSale: true,
    recipient: { hubActive: true, locale: "ru", paidPreviousCohort: false },
    renewal,
  });
  assert.equal(links.kind, "pages");
  assert.equal(pathOf(links.standard), "/ru/online/group");
  assert.equal(pathOf(links.plus), "/ru/online/group");
  assert.equal(pathOf(links.hub), "/ru/online/inspiration-hub");
  assert.equal(links.myAccess, null);
});

test("closed Hub sales drop the Hub block; a missing renewal campaign falls back to the group page", () => {
  const links = chooseCohortInviteLinks({
    campaignKey: "k",
    hubOnSale: false,
    recipient: { hubActive: true, locale: "en", paidPreviousCohort: true },
    renewal: { plus: null, standard: "renew-standard-3" },
  });
  assert.equal(links.hub, null);
  assert.equal(links.hubSpecialPrice, false);
  assert.equal(pathOf(links.standard), "/en/payment?renewal=renew-standard-3");
  assert.equal(pathOf(links.plus), "/en/online/group");

  const none = chooseCohortInviteLinks({
    campaignKey: "k",
    hubOnSale: true,
    recipient: { hubActive: false, locale: "en", paidPreviousCohort: true },
    renewal: { plus: null, standard: null },
  });
  assert.equal(none.kind, "pages");
});

test("the daily ceiling keeps the purchase reserve and never goes below zero", () => {
  assert.equal(getRemainingToday(0), RESEND_DAILY_LIMIT - PURCHASE_EMAIL_RESERVE);
  assert.equal(getRemainingToday(3), 17);
  assert.equal(getRemainingToday(25), 0);
});

test("a batch is a whole number within what is left today and in the list", () => {
  assert.deepEqual(checkBatchSize({ recipients: 38, remainingToday: 17, size: 15 }), {
    ok: true,
    size: 15,
  });
  assert.deepEqual(checkBatchSize({ recipients: 38, remainingToday: 17, size: 18 }), {
    error: "over_limit",
    ok: false,
  });
  assert.deepEqual(checkBatchSize({ recipients: 4, remainingToday: 17, size: 5 }), {
    error: "over_limit",
    ok: false,
  });
  assert.deepEqual(checkBatchSize({ recipients: 38, remainingToday: 0, size: 1 }), {
    error: "daily_limit_reached",
    ok: false,
  });
  assert.deepEqual(checkBatchSize({ recipients: 0, remainingToday: 17, size: 1 }), {
    error: "no_recipients",
    ok: false,
  });
  for (const size of [0, -1, 1.5, "15", null]) {
    assert.deepEqual(checkBatchSize({ recipients: 38, remainingToday: 17, size }), {
      error: "batch_size_invalid",
      ok: false,
    });
  }
});

test("a typed list splits on commas, spaces and lines, lowercases and drops repeats", () => {
  assert.deepEqual(
    parseAddressList(" Anna@Example.com, maria@example.com;\nanna@example.com  x "),
    ["anna@example.com", "maria@example.com", "x"],
  );
  assert.deepEqual(parseAddressList(" , ; "), []);
});

test("a typed list flags who already got this campaign and sends only to the rest", () => {
  const { checks, recipients } = checkCohortInviteAddresses({
    addresses: [
      "sent@example.com",
      "buyer@example.com",
      "paid@example.com",
      "blocked@example.com",
      "stranger@example.com",
      "not-an-email",
    ],
    rows: [
      row({ campaignStatus: "sent", email: "sent@example.com" }),
      row({ email: "buyer@example.com", locale: "pl" }),
      row({ email: "paid@example.com", paidCurrentCohort: true }),
      row({ blocked: true, email: "blocked@example.com" }),
    ],
  });

  assert.deepEqual(
    checks.map((check) => [check.email, check.status, check.locale]),
    [
      ["sent@example.com", "already_sent", null],
      ["buyer@example.com", "ready", "pl"],
      ["paid@example.com", "bought", null],
      ["blocked@example.com", "excluded", null],
      ["stranger@example.com", "ready_new", "en"],
      ["not-an-email", "invalid", null],
    ],
  );
  assert.deepEqual(
    recipients.map((recipient) => recipient.email),
    ["buyer@example.com", "stranger@example.com"],
  );
});
