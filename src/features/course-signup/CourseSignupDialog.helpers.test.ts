import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCourseSignupRequestBody,
  getSubmitFailureReason,
  settleSignupValues,
} from "./CourseSignupDialog.helpers";

test("a failed signup names its reason: rate limit first, then the server", () => {
  const cases: [string | undefined, number, string][] = [
    ["rate_limited", 400, "rateLimited"],
    [undefined, 429, "rateLimited"],
    // A rate-limit code wins over a server status, and a server code over a field one.
    ["rate_limited", 503, "rateLimited"],
    ["course_signup_failed", 400, "server"],
    [undefined, 500, "server"],
    ["invalid_email", 502, "server"],
    ["invalid_email", 400, "validation"],
    ["invalid_request_body", 400, "validation"],
    ["missing_consent", 400, "validation"],
    ["missing_required_fields", 422, "validation"],
    ["something_else", 400, "unknown"],
    [undefined, 404, "unknown"],
  ];

  for (const [errorCode, status, reason] of cases) {
    assert.equal(
      getSubmitFailureReason(errorCode, status),
      reason,
      `${errorCode} ${status}`,
    );
  }
});

test("typed values settle: spaces collapse, the request trims what is left", () => {
  const settled = settleSignupValues({
    consentAccepted: true,
    email: "  anna@example.com ",
    fullName: "  Anna   Strok ",
    socialContact: "   @anna    strok ",
  });

  assert.deepEqual(settled, {
    consentAccepted: true,
    email: "anna@example.com",
    fullName: "Anna Strok",
    socialContact: "@anna strok ",
  });
  assert.deepEqual(buildCourseSignupRequestBody({ locale: "pl", values: settled }), {
    consentAccepted: true,
    email: "anna@example.com",
    fullName: "Anna Strok",
    locale: "pl",
    socialContact: "@anna strok",
  });
});
