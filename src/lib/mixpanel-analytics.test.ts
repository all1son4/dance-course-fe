import assert from "node:assert/strict";
import test from "node:test";

import {
  INSPIRATION_HUB_ACCESS_OFFER_ID,
  INSPIRATION_HUB_PRODUCT_ID,
  INSPIRATION_HUB_RENEWAL_OFFER_ID,
  SELLABLE_PRODUCTS,
} from "@/constants/sellable-products";

import {
  getApiErrorAnalyticsProperties,
  getAppErrorAnalyticsProperties,
  getCommerceAnalyticsContext,
  getCtaEventProperties,
  getInitialMixpanelAttributionProperties,
  getMixpanelAttributionProperties,
  getMixpanelPageProperties,
  getPostPurchaseAccessAnalyticsProperties,
  getSafeDestinationProperties,
  getWebVitalAnalyticsProperties,
  MIXPANEL_BROWSER_CONFIG,
  MIXPANEL_EU_API_HOST,
  shouldRecordMixpanelLocation,
  shouldRecordMixpanelPath,
  shouldTrackMixpanelPath,
} from "./mixpanel-analytics";

test("keeps only bounded, non-identifying UTM attribution", () => {
  const properties = getMixpanelAttributionProperties(
    "?utm_source=instagram&utm_medium=paid_social&utm_campaign=summer+launch&utm_content=hero&utm_term=dance+course&gclid=private&utm_source_override=nope",
  );

  assert.deepEqual(properties, {
    utm_campaign: "summer launch",
    utm_content: "hero",
    utm_medium: "paid_social",
    utm_source: "instagram",
    utm_term: "dance course",
  });
  assert.deepEqual(getInitialMixpanelAttributionProperties(properties), {
    initial_utm_campaign: "summer launch",
    initial_utm_content: "hero",
    initial_utm_medium: "paid_social",
    initial_utm_source: "instagram",
    initial_utm_term: "dance course",
  });
  assert.deepEqual(
    getMixpanelAttributionProperties(
      `?utm_source=${encodeURIComponent("person@example.com")}&utm_campaign=${"x".repeat(121)}&utm_content=https%3A%2F%2Fexample.com%2Fprivate`,
    ),
    {},
  );
});

test("normalizes API failures without queries or arbitrary error text", () => {
  assert.deepEqual(
    getApiErrorAnalyticsProperties({
      endpoint: "/api/stripe/payment-intent?checkout=private",
      errorCode: "payment_intent_failed",
      failureStage: "intent_creation",
      method: "POST",
      status: 503,
    }),
    {
      api_endpoint: "/api/stripe/payment-intent",
      error_category: "server",
      error_code: "payment_intent_failed",
      failure_stage: "intent_creation",
      http_method: "POST",
      http_status: 503,
    },
  );
  assert.equal(
    getApiErrorAnalyticsProperties({
      endpoint: "https://example.com/api/private",
      failureStage: "load",
      method: "GET",
    }),
    null,
  );
});

test("classifies app errors without retaining messages", () => {
  assert.deepEqual(
    getAppErrorAnalyticsProperties({
      errorName: "ChunkLoadError",
      message: "Loading chunk 42 failed for private customer context",
      source: "window",
    }),
    {
      error_category: "chunk_load",
      error_code: "chunk_load_error",
      error_name: "ChunkLoadError",
      error_source: "window",
      is_unhandled: true,
    },
  );
});

test("uses the EU endpoint and removes full URL/referrer properties", () => {
  assert.equal(MIXPANEL_BROWSER_CONFIG.api_host, MIXPANEL_EU_API_HOST);
  assert.equal(MIXPANEL_BROWSER_CONFIG.ip, true);
  assert.deepEqual(MIXPANEL_BROWSER_CONFIG.property_blacklist, [
    "$current_url",
    "$initial_referrer",
    "$referrer",
    "current_url_search",
  ]);
  assert.equal(MIXPANEL_BROWSER_CONFIG.record_mask_all_inputs, true);
  assert.equal(MIXPANEL_BROWSER_CONFIG.record_mask_all_text, true);
  assert.equal(
    MIXPANEL_BROWSER_CONFIG.record_block_selector,
    "img, video, audio, [data-analytics-private]",
  );
  assert.equal(MIXPANEL_BROWSER_CONFIG.record_console, false);
  assert.equal(MIXPANEL_BROWSER_CONFIG.record_network, false);
});

test("reduces Web Vitals to non-identifying performance properties", () => {
  assert.deepEqual(
    getWebVitalAnalyticsProperties({
      delta: 12.5,
      name: "LCP",
      navigationType: "navigate",
      rating: "needs-improvement",
      value: 2512.5,
    }),
    {
      metric_delta: 12.5,
      metric_name: "LCP",
      metric_value: 2512.5,
      navigation_type: "navigate",
      rating: "needs-improvement",
    },
  );
  assert.equal(
    getWebVitalAnalyticsProperties({
      delta: 1,
      name: "Next.js-render",
      navigationType: "navigate",
      rating: "good",
      value: 10,
    }),
    null,
  );
});

test("autocapture collects behavior without forms, text, or sensitive routes", () => {
  const autocapture = MIXPANEL_BROWSER_CONFIG.autocapture;

  assert.equal(typeof autocapture, "object");

  if (!autocapture || typeof autocapture !== "object") {
    assert.fail("expected privacy-scoped autocapture configuration");
  }

  assert.equal(autocapture.click, true);
  assert.equal(autocapture.scroll, true);
  assert.equal(autocapture.rage_click, true);
  assert.equal(autocapture.dead_click, true);
  assert.equal(autocapture.input, false);
  assert.equal(autocapture.submit, false);
  assert.equal(autocapture.capture_text_content, false);
  assert.ok(autocapture.block_selectors?.includes("form"));
  assert.ok(
    autocapture.block_url_regexes?.some((pattern) =>
      pattern.test("https://example.com/en/payment?payment_intent=pi_private"),
    ),
  );
});

test("tracks public and payment page views but excludes internal admin traffic", () => {
  assert.equal(shouldTrackMixpanelPath("/en/online"), true);
  assert.equal(shouldTrackMixpanelPath("/pl/payment/success"), true);
  assert.equal(shouldTrackMixpanelPath("/admin"), false);
  assert.equal(shouldTrackMixpanelPath("/admin/invites"), false);
  assert.equal(shouldTrackMixpanelPath("/en/administrator-course"), true);
});

test("never records checkout/result DOM sessions", () => {
  assert.equal(shouldRecordMixpanelPath("/ru/online"), true);
  assert.equal(shouldRecordMixpanelPath("/en/payment"), false);
  assert.equal(shouldRecordMixpanelPath("/pl/payment/success"), false);
  assert.equal(shouldRecordMixpanelPath("/admin"), false);
  assert.equal(shouldRecordMixpanelLocation("/en/online", "?utm_source=test"), false);
  assert.equal(shouldRecordMixpanelLocation("/en/online", ""), true);
});

test("page properties contain only the normalized path and supported locale", () => {
  assert.deepEqual(getMixpanelPageProperties("/pl/online", "ru"), {
    page_path: "/pl/online",
    locale: "pl",
  });
  assert.deepEqual(getMixpanelPageProperties("/admin"), {
    page_path: "/admin",
  });
  assert.deepEqual(getMixpanelPageProperties("/online", "ru"), {
    page_path: "/online",
    locale: "ru",
  });
});

test("CTA properties carry a semantic id and a query-free destination only", () => {
  const origin = "https://annastrok.com";

  assert.deepEqual(
    getCtaEventProperties(
      { id: "contact_instagram", placement: "contacts" },
      "https://www.instagram.com/reel/abc/?igsh=private",
      origin,
    ),
    {
      cta_id: "contact_instagram",
      destination_domain: "www.instagram.com",
      placement: "contacts",
    },
  );
  assert.deepEqual(
    getCtaEventProperties(
      { id: "buy_online_group", offer_id: "offer-1", placement: "tariff_plus" },
      "/payment?productId=private#form",
      origin,
    ),
    {
      cta_id: "buy_online_group",
      destination_hash: "#form",
      destination_path: "/payment",
      offer_id: "offer-1",
      placement: "tariff_plus",
    },
  );
  assert.deepEqual(getCtaEventProperties({ id: "cookie_settings" }, undefined, origin), {
    cta_id: "cookie_settings",
  });
  assert.deepEqual(getSafeDestinationProperties("tel:+48571571214", origin), {});
  assert.deepEqual(
    getSafeDestinationProperties("mailto:person@example.com?subject=private", origin),
    {},
  );
  assert.deepEqual(getSafeDestinationProperties("#contacts", origin), {
    destination_hash: "#contacts",
  });
  // Without a browser origin (server render) nothing is derived.
  assert.deepEqual(getSafeDestinationProperties("https://t.me/support"), {});
});

test("personal access routes block recording and autocapture even without a token query", () => {
  for (const path of ["/access", "/ru/access", "/en/access/"]) {
    assert.equal(shouldTrackMixpanelPath(path), true);
    assert.equal(shouldRecordMixpanelPath(path), false);
    assert.equal(shouldRecordMixpanelLocation(path, ""), false);
    const config = MIXPANEL_BROWSER_CONFIG.autocapture;
    assert.ok(config && typeof config === "object");
    assert.ok(
      config.block_url_regexes?.some((pattern) =>
        pattern.test(`https://example.test${path}?k=private`),
      ),
    );
  }
  assert.equal(shouldRecordMixpanelPath("/online/inspiration-hub"), true);
  assert.equal(shouldRecordMixpanelPath("/ru/online/inspiration-hub"), true);
  assert.deepEqual(
    getSafeDestinationProperties(
      "/ru/access?k=personal_hmac&email=private@example.test",
      "https://example.test",
    ),
    {
      destination_path: "/ru/access",
    },
  );
});

test("Hub full and member prices are distinct without claiming a previous Hub purchase", () => {
  for (const [offer, kind] of [
    [INSPIRATION_HUB_ACCESS_OFFER_ID, "full_price"],
    [INSPIRATION_HUB_RENEWAL_OFFER_ID, "member_price"],
  ] as const) {
    assert.deepEqual(
      getCommerceAnalyticsContext({
        product_id: INSPIRATION_HUB_PRODUCT_ID,
        offer_id: offer,
      }),
      {
        checkout_kind: kind,
        hub_access: "standalone",
      },
    );
  }
});

test("all Online tariffs consistently distinguish Plus Hub and renewal prices", () => {
  const product = SELLABLE_PRODUCTS["online-group-anna-strok"];
  for (const offer of product.offers) {
    assert.deepEqual(
      getCommerceAnalyticsContext({ product_id: product.id, offer_id: offer.id }),
      {
        checkout_kind: offer.code.startsWith("renewal-") ? "renewal" : "full_price",
        hub_access: offer.code.endsWith("library-access") ? "plus" : "none",
      },
    );
  }
  const firstTouch = SELLABLE_PRODUCTS["first-touch"];
  assert.deepEqual(
    getCommerceAnalyticsContext({
      product_id: firstTouch.id,
      offer_id: firstTouch.offers[0].id,
    }),
    {
      checkout_kind: "full_price",
      hub_access: "none",
    },
  );
});

test("commerce classification omits unknown, incomplete and mismatched catalogue selections", () => {
  for (const properties of [
    {},
    { product_id: INSPIRATION_HUB_PRODUCT_ID },
    { product_id: "unknown", offer_id: INSPIRATION_HUB_RENEWAL_OFFER_ID },
    { product_id: INSPIRATION_HUB_PRODUCT_ID, offer_id: "unknown" },
    {
      product_id: SELLABLE_PRODUCTS["online-group-anna-strok"].id,
      offer_id: INSPIRATION_HUB_RENEWAL_OFFER_ID,
    },
    { product_id: null, offer_id: 123 },
  ])
    assert.deepEqual(getCommerceAnalyticsContext(properties), {});
});

const accessContext = {
  accessUrl: "",
  isContextValid: true,
  statusKind: "pending" as const,
};

test("a scheduled Hub is counted separately and dates/invites never enter its delivery event", () => {
  const result = getPostPurchaseAccessAnalyticsProperties({
    ...accessContext,
    accesses: [{ status: "scheduled", accessUrl: "" }],
  });
  assert.deepEqual(result, {
    active_access_count: 0,
    ready_access_count: 0,
    scheduled_access_count: 1,
    unavailable_access_count: 0,
    status: "scheduled",
  });
});

test("mixed Plus delivery preserves ready, active, scheduled and unavailable counts", () => {
  const result = getPostPurchaseAccessAnalyticsProperties({
    ...accessContext,
    accesses: [
      { status: "ready", accessUrl: "https://t.me/private-invite" },
      { status: "active", accessUrl: "" },
      { status: "scheduled", accessUrl: "" },
      { status: "expired", accessUrl: "" },
    ],
  });
  assert.deepEqual(result, {
    active_access_count: 1,
    ready_access_count: 1,
    scheduled_access_count: 1,
    unavailable_access_count: 1,
    status: "partial",
  });
  assert.doesNotMatch(JSON.stringify(result), /https|private|t\.me/u);
});

test("legacy and unavailable deliveries retain their analytics behavior", () => {
  assert.equal(
    getPostPurchaseAccessAnalyticsProperties({ ...accessContext, accesses: [] }),
    null,
  );
  assert.equal(
    getPostPurchaseAccessAnalyticsProperties({
      ...accessContext,
      accesses: [],
      accessUrl: "private",
    })?.status,
    "ready",
  );
  assert.equal(
    getPostPurchaseAccessAnalyticsProperties({
      ...accessContext,
      accesses: [],
      isContextValid: false,
    })?.status,
    "invalid_context",
  );
  assert.equal(
    getPostPurchaseAccessAnalyticsProperties({
      ...accessContext,
      accesses: [],
      statusKind: "unavailable",
    })?.status,
    "unavailable",
  );
  for (const [status, expected] of [
    ["active", "already_active"],
    ["expired", "unavailable"],
    ["unavailable", "unavailable"],
    ["ready", "unavailable"],
  ] as const) {
    assert.equal(
      getPostPurchaseAccessAnalyticsProperties({
        ...accessContext,
        accesses: [{ status, accessUrl: "" }],
      })?.status,
      expected,
    );
  }
  assert.equal(
    getPostPurchaseAccessAnalyticsProperties({
      ...accessContext,
      accesses: [
        { status: "scheduled", accessUrl: "" },
        { status: "ready", accessUrl: "invite" },
      ],
    })?.status,
    "ready",
  );
});
