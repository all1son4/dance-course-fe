import assert from "node:assert/strict";
import test from "node:test";

process.env.ACCESS_LINK_SECRET = "unsubscribe-link-test-secret-0123456789abcdef";

const leadId = "lead_0123456789abcdef01234567";

test("an unsubscribe token verifies only for the lead it was signed for", async () => {
  const { buildUnsubscribeUrl, createUnsubscribeToken, verifyUnsubscribeToken } =
    await import("./unsubscribe-link");
  const token = createUnsubscribeToken(leadId);

  assert.ok(token);
  assert.equal(verifyUnsubscribeToken(token), leadId);

  const [, signature] = token.split(".");
  assert.equal(
    verifyUnsubscribeToken(`lead_aaaaaaaaaaaaaaaaaaaaaaaa.${signature}`),
    null,
  );
  assert.equal(verifyUnsubscribeToken(`${token}x`), null);
  assert.equal(verifyUnsubscribeToken(`${token}.extra`), null);
  assert.equal(verifyUnsubscribeToken(leadId), null);
  assert.equal(verifyUnsubscribeToken(""), null);
  assert.equal(createUnsubscribeToken("not-a-lead"), null);

  const url = new URL(buildUnsubscribeUrl(leadId, "pl")!);
  assert.equal(url.pathname, "/api/email/unsubscribe");
  assert.equal(url.searchParams.get("t"), token);
  assert.equal(url.searchParams.get("lang"), "pl");
  // The address itself never travels in the link.
  assert.ok(!url.toString().includes("@"));
});

test("the «Мой доступ» link key does not open the unsubscribe purpose", async () => {
  const { verifyUnsubscribeToken } = await import("./unsubscribe-link");
  const { createMyAccessToken } = await import("@/lib/my-access/link");
  const myAccess = createMyAccessToken("0f8fad5b-d9cb-469f-a165-70867728950e");

  assert.ok(myAccess);
  assert.equal(verifyUnsubscribeToken(myAccess), null);
});
