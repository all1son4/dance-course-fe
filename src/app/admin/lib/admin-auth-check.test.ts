import assert from "node:assert/strict";
import test from "node:test";

import type { AuthResponse } from "./admin.types";
import { getAdminAuthCheckOutcome } from "./admin-auth-check";
import type { AdminJsonResult } from "./admin-request";

const result = (
  data: AuthResponse,
  overrides: Partial<AdminJsonResult<AuthResponse>> = {},
): AdminJsonResult<AuthResponse> => ({
  data,
  errorCode: "",
  ok: true,
  unauthorized: false,
  ...overrides,
});

test("a valid auth response confirms the session", () => {
  assert.equal(getAdminAuthCheckOutcome(result({ authorized: true })), "authorized");
  assert.equal(getAdminAuthCheckOutcome(result({ authorized: false })), "unauthorized");
});

test("a 401 or absent configuration is distinct from a transient failure", () => {
  assert.equal(
    getAdminAuthCheckOutcome(result({}, { ok: false, unauthorized: true })),
    "unauthorized",
  );
  assert.equal(
    getAdminAuthCheckOutcome(result({}, { errorCode: "auth_not_configured", ok: false })),
    "not_configured",
  );
  assert.equal(
    getAdminAuthCheckOutcome(result({}, { errorCode: "network_error", ok: false })),
    "unavailable",
  );
  assert.equal(getAdminAuthCheckOutcome(result({})), "unavailable");
});
