import type { AuthResponse } from "./admin.types";
import type { AdminJsonResult } from "./admin-request";

export type AdminAuthCheckOutcome =
  "authorized" | "not_configured" | "unauthorized" | "unavailable";

export const getAdminAuthCheckOutcome = (
  result: AdminJsonResult<AuthResponse>,
): AdminAuthCheckOutcome => {
  if (result.ok && result.data.authorized === true) {
    return "authorized";
  }

  if (result.ok && result.data.authorized === false) {
    return "unauthorized";
  }

  if (result.errorCode === "auth_not_configured") {
    return "not_configured";
  }

  if (result.unauthorized || result.errorCode === "unauthorized") {
    return "unauthorized";
  }

  // A timeout, 5xx, or malformed successful response cannot prove that the
  // cookie expired. The UI must not turn those into a false sign-out.
  return "unavailable";
};
