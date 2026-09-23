import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  ADMIN_INVITE_LINKS_SESSION_COOKIE_NAME,
  ADMIN_INVITE_LINKS_SESSION_TTL_SECONDS,
  createAdminInviteLinksSessionCookieValue,
  isAdminInviteLinksPasswordConfigured,
  isAdminInviteLinksPasswordValid,
  isAdminInviteLinksRequestAuthenticated,
  isAdminInviteLinksSessionCookieValid,
} from "./admin-invite-links-auth";

const TEST_PASSWORD = "test-only-admin-password";

const withAdminPassword = (password: string | undefined, run: () => void) => {
  const previousPassword = process.env.ADMIN_PASSWORD;

  if (password === undefined) {
    delete process.env.ADMIN_PASSWORD;
  } else {
    process.env.ADMIN_PASSWORD = password;
  }

  try {
    run();
  } finally {
    if (previousPassword === undefined) {
      delete process.env.ADMIN_PASSWORD;
    } else {
      process.env.ADMIN_PASSWORD = previousPassword;
    }
  }
};

test("admin auth fails closed when the shared password is absent", () => {
  withAdminPassword(undefined, () => {
    assert.equal(isAdminInviteLinksPasswordConfigured(), false);
    assert.equal(isAdminInviteLinksPasswordValid(TEST_PASSWORD), false);
    assert.equal(createAdminInviteLinksSessionCookieValue(), "");
    assert.equal(isAdminInviteLinksSessionCookieValid("123.signature"), false);
  });
});

test("current login accepts only the configured shared password", () => {
  withAdminPassword(` ${TEST_PASSWORD} `, () => {
    assert.equal(isAdminInviteLinksPasswordConfigured(), true);
    assert.equal(isAdminInviteLinksPasswordValid(TEST_PASSWORD), true);
    assert.equal(isAdminInviteLinksPasswordValid(` ${TEST_PASSWORD} `), true);
    assert.equal(isAdminInviteLinksPasswordValid("wrong-password"), false);
    assert.equal(isAdminInviteLinksPasswordValid(""), false);
  });
});

test("current cookie authenticates admin requests until its signed expiry", () => {
  withAdminPassword(TEST_PASSWORD, () => {
    const issuedAt = Math.floor(Date.now() / 1000);
    const cookieValue = createAdminInviteLinksSessionCookieValue();
    const [expiresAtRaw, signature] = cookieValue.split(".");
    const expiresAt = Number(expiresAtRaw);

    assert.ok(signature);
    assert.ok(expiresAt >= issuedAt + ADMIN_INVITE_LINKS_SESSION_TTL_SECONDS);
    assert.ok(expiresAt <= issuedAt + ADMIN_INVITE_LINKS_SESSION_TTL_SECONDS + 1);
    assert.equal(isAdminInviteLinksSessionCookieValid(cookieValue), true);

    const request = new Request("https://example.test/admin/api/sales", {
      headers: {
        cookie: `other=value; ${ADMIN_INVITE_LINKS_SESSION_COOKIE_NAME}=${cookieValue}`,
      },
    });

    assert.equal(isAdminInviteLinksRequestAuthenticated(request), true);
    assert.equal(
      isAdminInviteLinksRequestAuthenticated(
        new Request("https://example.test/admin/api/sales"),
      ),
      false,
    );
    assert.equal(isAdminInviteLinksSessionCookieValid(`${expiresAtRaw}.tampered`), false);
  });
});

test("expired cookies and shared-password rotation invalidate the current session", () => {
  withAdminPassword(TEST_PASSWORD, () => {
    const expiredAt = Math.floor(Date.now() / 1000) - 1;
    const expiredSignature = createHmac("sha256", TEST_PASSWORD)
      .update(String(expiredAt))
      .digest("base64url");

    assert.equal(
      isAdminInviteLinksSessionCookieValid(`${expiredAt}.${expiredSignature}`),
      false,
    );

    const cookieValue = createAdminInviteLinksSessionCookieValue();

    process.env.ADMIN_PASSWORD = "rotated-test-only-password";
    assert.equal(isAdminInviteLinksSessionCookieValid(cookieValue), false);
  });
});
