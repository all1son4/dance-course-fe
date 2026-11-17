import assert from "node:assert/strict";
import test from "node:test";

import { createTelegramLoginNonce, verifyTelegramLoginNonce } from "./login";

process.env.TELEGRAM_LOGIN_NONCE_SECRET = "test-login-nonce-secret";

const session = {
  checkoutSessionId: "chk_login_nonce_test",
  slug: "rnw_login_nonce_test",
};

const verifyAfter = (nonce: string, hours: number, t: test.TestContext) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() + hours * 60 * 60 * 1000 });
  try {
    return verifyTelegramLoginNonce({ ...session, nonce });
  } finally {
    t.mock.timers.reset();
  }
};

test("a login nonce survives a checkout tab left open for an hour", (t) => {
  const nonce = createTelegramLoginNonce(session);

  assert.equal(verifyAfter(nonce, 1, t), true);
});

test("a login nonce expires after a few hours", (t) => {
  const nonce = createTelegramLoginNonce(session);

  assert.equal(verifyAfter(nonce, 4, t), false);
});

test("a login nonce is bound to its checkout page", () => {
  const nonce = createTelegramLoginNonce(session);

  assert.equal(
    verifyTelegramLoginNonce({ ...session, checkoutSessionId: "chk_other", nonce }),
    false,
  );
});
