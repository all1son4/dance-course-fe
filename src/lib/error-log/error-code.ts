import { getDatabaseErrorCode } from "@/db/database-read-retry";

/*
 * A safe, stable code for an error: what went wrong without who it was about. Error
 * messages are never kept as they are — a Drizzle message carries the query
 * parameters (emails, Telegram IDs), a Resend one the response body. Only shapes we
 * know are free of personal data pass: Telegram's description, an HTTP status, a
 * SQLSTATE, Stripe's type and code, and our own snake_case codes.
 */

export type ErrorArea = "telegram" | "stripe" | "email" | "database" | "app";
export type ErrorCode = { area: ErrorArea; code: string };

const MAX_CODE_LENGTH = 120;

/** Telegram descriptions are fixed phrases; numbers (retry after N) are folded. */
const normalizeTelegramDescription = (description: string) =>
  description
    .replace(/^(Bad Request|Forbidden|Conflict|Unauthorized|Not Found):\s*/iu, "")
    .replace(/\d+/gu, "N")
    .trim();

/** Our own codes: `access_invitation_links_unavailable`, `business_outbox_x:y`. */
const OWN_CODE = /^[a-z][a-z0-9_]*(?::[a-z0-9_.-]+)*$/u;

const clip = (code: string) => code.slice(0, MAX_CODE_LENGTH);

const stripeCodeOf = (error: unknown) => {
  if (typeof error !== "object" || error === null) return null;
  const { type, code } = error as { type?: unknown; code?: unknown };
  if (typeof type !== "string" || !type.startsWith("Stripe")) return null;
  return clip(
    [type.replace(/^Stripe/u, "").replace(/Error$/u, "") || "error", code]
      .filter((part) => typeof part === "string" && part)
      .join(":"),
  );
};

export const getSafeErrorCategory = (error: unknown) => {
  if (error instanceof SyntaxError) return "SyntaxError";
  if (error instanceof TypeError) return "TypeError";
  if (error instanceof RangeError) return "RangeError";
  if (error instanceof Error) return "Error";
  return "Unknown";
};

export const describeErrorCode = (error: unknown): ErrorCode => {
  const message = error instanceof Error ? error.message.trim() : "";
  const name = error instanceof Error ? error.name : "";

  const telegram = /^telegram_api_failed:([A-Za-z]+):([\s\S]*)$/u.exec(message);
  if (telegram) {
    return {
      area: "telegram",
      code: clip(`${telegram[1]}: ${normalizeTelegramDescription(telegram[2] ?? "")}`),
    };
  }
  if (message.startsWith("telegram_")) {
    return { area: "telegram", code: clip(message.split(/\s/u)[0] ?? message) };
  }

  const resend = /^resend_request_failed:(\d{3})/u.exec(message);
  if (resend) return { area: "email", code: `resend: HTTP ${resend[1]}` };
  if (message === "resend_request_timeout")
    return { area: "email", code: "resend: timeout" };
  if (message === "missing_resend_api_key") return { area: "email", code: message };

  const stripe = stripeCodeOf(error);
  if (stripe) return { area: "stripe", code: `stripe: ${stripe}` };

  if (name === "AbortError" || name === "TimeoutError")
    return { area: "app", code: "timeout" };

  const databaseCode = getDatabaseErrorCode(error);
  if (databaseCode && /^[0-9A-Z]{5}$/u.test(databaseCode)) {
    return { area: "database", code: `postgres: ${databaseCode}` };
  }
  if (databaseCode && /^E[A-Z]+$/u.test(databaseCode)) {
    // A network failure of the driver or of fetch (ECONNRESET, ETIMEDOUT).
    return { area: "app", code: databaseCode };
  }

  if (OWN_CODE.test(message)) return { area: "app", code: clip(message) };

  return { area: "app", code: getSafeErrorCategory(error) };
};
