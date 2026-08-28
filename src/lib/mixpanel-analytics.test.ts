import assert from "node:assert/strict";
import test from "node:test";

import {
  getMixpanelPageProperties,
  getWebVitalAnalyticsProperties,
  MIXPANEL_BROWSER_CONFIG,
  MIXPANEL_EU_API_HOST,
  shouldRecordMixpanelLocation,
  shouldRecordMixpanelPath,
  shouldTrackMixpanelPath,
} from "./mixpanel-analytics";

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
