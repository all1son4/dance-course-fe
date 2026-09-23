import assert from "node:assert/strict";
import test from "node:test";

import { POST as sendMonthlySalesReport } from "@/app/admin/api/reports/monthly-sales/route";
import { POST } from "@/app/admin/auth/route";
import {
  ADMIN_INVITE_LINKS_SESSION_COOKIE_NAME,
  createAdminInviteLinksSessionCookieValue,
} from "@/lib/admin-invite-links-auth";

test("admin login returns 503 when enforced distributed limiter is missing", async () => {
  const keys = [
    "ADMIN_PASSWORD",
    "UPSTASH_RATE_LIMIT_ENFORCE_ADMIN",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  try {
    process.env.ADMIN_PASSWORD = "test-password";
    process.env.UPSTASH_RATE_LIMIT_ENFORCE_ADMIN = "1";
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const response = await POST(
      new Request("https://example.test/admin/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://example.test",
        },
        body: JSON.stringify({ password: "test-password" }),
      }),
    );

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { errorCode: "rate_limit_unavailable" });
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("admin report send is also blocked before side effects when Upstash is missing", async () => {
  const keys = [
    "ADMIN_PASSWORD",
    "UPSTASH_RATE_LIMIT_ENFORCE_ADMIN",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  try {
    process.env.ADMIN_PASSWORD = "test-password";
    process.env.UPSTASH_RATE_LIMIT_ENFORCE_ADMIN = "1";
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const cookieValue = createAdminInviteLinksSessionCookieValue();
    const response = await sendMonthlySalesReport(
      new Request("https://example.test/admin/api/reports/monthly-sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${ADMIN_INVITE_LINKS_SESSION_COOKIE_NAME}=${cookieValue}`,
          Origin: "https://example.test",
        },
        body: JSON.stringify({ reportMonth: "2026-08" }),
      }),
    );

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { errorCode: "rate_limit_unavailable" });
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
