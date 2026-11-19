import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInvitationUrl,
  createInvitationToken,
  INVITATION_LINK_TTL_MS,
  verifyInvitationToken,
} from "@/lib/access-invitations/link";
import { createMyAccessToken } from "@/lib/my-access/link";

const PURCHASE = "0f5c8a52-6b4e-4c1f-9b2a-3d7e8f9a1b2c";
const SECRET = "test-secret-that-is-long-enough-for-hmac-0123";
const NOW = new Date("2026-11-19T10:00:00.000Z");

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

test("an invitation link opens its own purchase for 30 days, then expires", () => {
  withSecret(SECRET, () => {
    const token = createInvitationToken(PURCHASE, NOW);
    assert.ok(token);
    assert.deepEqual(verifyInvitationToken(token, NOW), {
      status: "valid",
      purchaseId: PURCHASE,
    });
    assert.deepEqual(
      verifyInvitationToken(
        token,
        new Date(NOW.getTime() + INVITATION_LINK_TTL_MS - 1000),
      ),
      { status: "valid", purchaseId: PURCHASE },
    );
    assert.deepEqual(
      verifyInvitationToken(
        token,
        new Date(NOW.getTime() + INVITATION_LINK_TTL_MS + 1000),
      ),
      { status: "expired" },
    );
  });
});

test("a changed purchase, date or signature, or another link's key, is refused", () => {
  withSecret(SECRET, () => {
    const token = createInvitationToken(PURCHASE, NOW)!;
    const [, issued, signature] = token.split(".");
    const other = "1f5c8a52-6b4e-4c1f-9b2a-3d7e8f9a1b2c";

    assert.deepEqual(verifyInvitationToken(`${other}.${issued}.${signature}`, NOW), {
      status: "invalid",
    });
    // A later issue date would stretch the 30 days.
    assert.deepEqual(
      verifyInvitationToken(
        `${PURCHASE}.${(Number.parseInt(issued!, 36) + 99).toString(36)}.${signature}`,
        NOW,
      ),
      { status: "invalid" },
    );
    assert.deepEqual(verifyInvitationToken(`${token}x`, NOW), { status: "invalid" });
    assert.deepEqual(verifyInvitationToken(`${token}.extra`, NOW), { status: "invalid" });
    assert.deepEqual(verifyInvitationToken("", NOW), { status: "invalid" });
    // A «Мой доступ» key never opens an invitation.
    assert.deepEqual(verifyInvitationToken(createMyAccessToken(PURCHASE), NOW), {
      status: "invalid",
    });
  });
});

test("without the secret there are no invitation links", () => {
  withSecret(undefined, () => {
    assert.equal(createInvitationToken(PURCHASE, NOW), null);
    assert.equal(buildInvitationUrl(PURCHASE, "ru", NOW), null);
    assert.deepEqual(verifyInvitationToken("anything", NOW), { status: "invalid" });
  });
});

test("the email link carries the language segment and the token", () => {
  withSecret(SECRET, () => {
    const url = buildInvitationUrl(PURCHASE, "pl", NOW);
    assert.ok(url);
    const parsed = new URL(url!);
    assert.equal(parsed.pathname, "/pl/invitation");
    assert.deepEqual(verifyInvitationToken(parsed.searchParams.get("k"), NOW), {
      status: "valid",
      purchaseId: PURCHASE,
    });
    assert.equal(
      new URL(buildInvitationUrl(PURCHASE, "de", NOW)!).pathname,
      "/invitation",
    );
  });
});
