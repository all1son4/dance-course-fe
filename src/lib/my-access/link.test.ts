import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMyAccessPath,
  createMyAccessToken,
  isMyAccessLinkConfigured,
  verifyMyAccessToken,
} from "@/lib/my-access/link";

const CUSTOMER = "0f5c8a52-6b4e-4c1f-9b2a-3d7e8f9a1b2c";
const SECRET = "test-secret-that-is-long-enough-for-hmac-0123";

const withSecret = (secret: string | undefined, run: () => void) => {
  const previous = process.env.ACCESS_LINK_SECRET;
  if (secret === undefined) delete process.env.ACCESS_LINK_SECRET;
  else process.env.ACCESS_LINK_SECRET = secret;
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env.ACCESS_LINK_SECRET;
    else process.env.ACCESS_LINK_SECRET = previous;
  }
};

test("a signed link opens for its own customer only", () => {
  withSecret(SECRET, () => {
    const token = createMyAccessToken(CUSTOMER);
    assert.ok(token);
    assert.equal(verifyMyAccessToken(token), CUSTOMER);

    const other = "1f5c8a52-6b4e-4c1f-9b2a-3d7e8f9a1b2c";
    const forged = `${other}.${token!.split(".")[1]}`;
    assert.equal(verifyMyAccessToken(forged), null);
    assert.equal(verifyMyAccessToken(`${token}x`), null);
    assert.equal(verifyMyAccessToken(`${token}.extra`), null);
    assert.equal(verifyMyAccessToken(""), null);
  });
});

test("changing the secret revokes every link", () => {
  let token: string | null = null;
  withSecret(SECRET, () => {
    token = createMyAccessToken(CUSTOMER);
  });
  withSecret(`${SECRET}-rotated`, () => {
    assert.equal(verifyMyAccessToken(token), null);
  });
});

test("without a secret the feature is off", () => {
  withSecret(undefined, () => {
    assert.equal(isMyAccessLinkConfigured(), false);
    assert.equal(createMyAccessToken(CUSTOMER), null);
    assert.equal(buildMyAccessPath(CUSTOMER), null);
  });
  withSecret("short", () => {
    assert.equal(isMyAccessLinkConfigured(), false);
  });
});

test("only UUID customer ids are signed", () => {
  withSecret(SECRET, () => {
    assert.equal(createMyAccessToken("not-a-uuid"), null);
    assert.match(
      buildMyAccessPath(CUSTOMER.toUpperCase()) ?? "",
      /^\/access\?k=0f5c8a52-/u,
    );
  });
});
