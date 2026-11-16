import assert from "node:assert/strict";
import test from "node:test";

import { buildHubExpiryReminderEmail } from "@/lib/email/hub-expiry-reminder";
import { getMixpanelAttributionProperties } from "@/lib/mixpanel-analytics";

test("7/3-day reminders attribute every website CTA and preserve checkout and personal access parameters", () => {
  for (const kind of [7, 3] as const) {
    for (const locale of ["ru", "en", "pl"]) {
      const email = buildHubExpiryReminderEmail({
        endsAt: new Date("2026-12-12T23:00:00Z"),
        kind,
        locale,
        myAccessUrl: `https://annastrok.com/${locale}/access?k=personal_secret`,
        onlineCohortStartsAt: new Date("2026-12-14T17:00:00Z"),
      });
      const urls = [...email.text.matchAll(/https?:\/\/\S+/gu)]
        .map(([href]) => new URL(href))
        .filter((url) => url.searchParams.get("utm_source") === "inspiration_hub");
      assert.equal(urls.length, 3);
      for (const url of urls) {
        assert.equal(url.searchParams.get("utm_campaign"), `hub_expiry_${kind}d`);
        assert.equal(url.searchParams.get("utm_source"), "inspiration_hub");
        assert.equal(url.searchParams.get("utm_medium"), "email");
        assert.ok(email.html.includes(url.href.replaceAll("&", "&amp;")));
        assert.doesNotMatch(
          JSON.stringify(getMixpanelAttributionProperties(url.search)),
          /personal_secret|renewal|\?k=/u,
        );
      }
      assert.equal(
        urls
          .find((url) => url.pathname.endsWith("/payment"))
          ?.searchParams.get("renewal"),
        "inspiration-hub",
      );
      assert.equal(
        urls.find((url) => url.pathname.endsWith("/access"))?.searchParams.get("k"),
        "personal_secret",
      );
      assert.deepEqual(urls.map((url) => url.searchParams.get("utm_content")).sort(), [
        "my_access",
        "online_group",
        "renew_hub",
      ]);
    }
  }
});

test("a reminder without an Online offer or personal access link keeps only its Hub CTA", () => {
  const email = buildHubExpiryReminderEmail({
    endsAt: new Date("2026-12-12T23:00:00Z"),
    kind: 7,
    locale: "ru",
  });
  assert.match(email.text, /utm_content=renew_hub/u);
  assert.doesNotMatch(email.text, /utm_content=(?:online_group|my_access)|\/access\?/u);
});
