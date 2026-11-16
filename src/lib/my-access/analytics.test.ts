import assert from "node:assert/strict";
import test from "node:test";

import { getCtaEventProperties } from "@/lib/mixpanel-analytics";

import { getMyAccessActionAnalytics, getMyAccessAnalyticsProperties } from "./analytics";

test("access summaries contain bounded states and counts without customer/card data", () => {
  const card = {
    id: "hub:private_telegram_id",
    kind: "hub" as const,
    chip: "endsSoon" as const,
    action: {
      key: "renewHub" as const,
      href: "/payment?renewal=inspiration-hub&k=private",
    },
    period: { start: "private_date", end: "private_date" },
    status: { key: "hub.activeUntil", values: { date: "private_date" } },
  };
  assert.deepEqual(
    getMyAccessAnalyticsProperties("ready", [
      card,
      card,
      { kind: "channel", chip: "active" },
    ]),
    {
      status: "ready",
      card_count: 3,
      hub_card_count: 2,
      hub_states: ["endsSoon"],
      has_renewal_action: true,
    },
  );
  const metadata = getMyAccessActionAnalytics(card);
  assert.ok(metadata);
  const cta = getCtaEventProperties(metadata, card.action.href, "https://example.test");
  assert.deepEqual(cta, {
    cta_id: "my_access_renew_hub",
    placement: "my_access",
    access_action: "renewHub",
    access_kind: "hub",
    access_state: "endsSoon",
    destination_path: "/payment",
  });
  assert.doesNotMatch(
    JSON.stringify([cta, getMyAccessAnalyticsProperties("ready", [card])]),
    /private|date|telegram|renewal=/u,
  );
});

test("My access view states distinguish a missing/invalid link from an empty account", () => {
  for (const status of ["link_required", "invalid_link", "empty"] as const) {
    assert.deepEqual(getMyAccessAnalyticsProperties(status), {
      status,
      card_count: 0,
      hub_card_count: 0,
      hub_states: [],
      has_renewal_action: false,
    });
  }
});

test("expired Hub and support actions have distinct CTA identifiers", () => {
  for (const [key, id] of [
    ["buyHub", "my_access_buy_hub"],
    ["support", "my_access_contact_support"],
  ] as const) {
    assert.equal(
      getMyAccessActionAnalytics({
        kind: "hub",
        chip: "ended",
        action: { key, href: "private" },
      })?.id,
      id,
    );
  }
  assert.equal(getMyAccessActionAnalytics({ kind: "hub", chip: "active" }), undefined);
  assert.deepEqual(
    getMyAccessAnalyticsProperties("ready", [
      { kind: "hub", chip: "upcoming" },
      { kind: "hub", chip: "active" },
    ]).hub_states,
    ["active", "upcoming"],
  );
});
