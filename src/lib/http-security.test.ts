import assert from "node:assert/strict";
import test from "node:test";

import { parseJsonBody, readBoundedTextBody } from "./http-security";

const jsonRequest = (body: string, contentLength?: string) =>
  new Request("https://example.test/api", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(contentLength ? { "Content-Length": contentLength } : {}),
    },
    body,
  });

test("bounded JSON parser accepts a body at its exact byte limit", async () => {
  const body = '{"name":"Anya"}';
  const result = await parseJsonBody<{ name: string }>(
    jsonRequest(body),
    Buffer.byteLength(body),
  );

  assert.deepEqual(result.body, { name: "Anya" });
  assert.equal(result.errorResponse, null);
});

test("bounded JSON parser rejects oversized bodies without Content-Length", async () => {
  const result = await parseJsonBody(jsonRequest('{"name":"Anya"}'), 8);

  assert.equal(result.body, null);
  assert.equal(result.errorResponse?.status, 413);
  assert.deepEqual(await result.errorResponse?.json(), {
    errorCode: "payload_too_large",
  });
});

test("bounded JSON parser does not trust a forged short Content-Length", async () => {
  const result = await parseJsonBody(jsonRequest('{"name":"Anya"}', "1"), 8);

  assert.equal(result.body, null);
  assert.equal(result.errorResponse?.status, 413);
});

test("bounded JSON parser keeps malformed JSON as an invalid body", async () => {
  const result = await parseJsonBody(jsonRequest("{"), 8);

  assert.equal(result.body, null);
  assert.equal(result.errorResponse, null);
});

test("bounded text reader counts UTF-8 bytes, not characters", async () => {
  const text = "ą";
  const accepted = await readBoundedTextBody(jsonRequest(text), 2);
  const rejected = await readBoundedTextBody(jsonRequest(text), 1);

  assert.deepEqual(accepted, { status: "ok", text });
  assert.deepEqual(rejected, { status: "too_large" });
});
