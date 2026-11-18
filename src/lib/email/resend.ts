const resendApiKey = process.env.RESEND_API_KEY?.trim() ?? "";
const resendFromEmail = process.env.RESEND_FROM_EMAIL?.trim() ?? "onboarding@resend.dev";

/**
 * Two senders (owner, 2026-11-18): payments — the purchase email with its invoice
 * and the monthly report — keep RESEND_FROM_EMAIL; reminders, broadcasts, access
 * notices and the «Мой доступ» link come from RESEND_INFO_FROM_EMAIL. Until that
 * one is set they use the payments address, as before.
 */
export type ResendSender = "billing" | "info";

const fromAddress = (sender: ResendSender) =>
  sender === "info"
    ? process.env.RESEND_INFO_FROM_EMAIL?.trim() || resendFromEmail
    : resendFromEmail;
const resendReplyTo = process.env.RESEND_REPLY_TO?.trim() ?? "";
const RESEND_REQUEST_TIMEOUT_MS = 4_000;

const normalizeEmailSubject = (subject: string) => subject.replace(/\s+/g, " ").trim();

export type SendResendEmailInput = {
  attachments?: Array<{
    content: string;
    filename: string;
  }>;
  /** Extra email headers, e.g. List-Unsubscribe for a broadcast. */
  headers?: Record<string, string>;
  html: string;
  idempotencyKey?: string;
  /** Which address it comes from; payments (`billing`) unless said otherwise. */
  sender?: ResendSender;
  subject: string;
  text: string;
  to: string;
};

export const isResendConfigured = () => Boolean(resendApiKey);

/**
 * Resend refuses with 429 for its rate limit and for the daily or monthly quota.
 * A batch stops on it: nothing after it would be accepted either.
 */
export const isResendQuotaError = (error: unknown) =>
  error instanceof Error &&
  (error.message.startsWith("resend_request_failed:429:") ||
    /(daily|monthly)_quota_exceeded/u.test(error.message));

export const sendResendEmail = async ({
  attachments,
  headers,
  html,
  idempotencyKey,
  sender = "billing",
  subject,
  text,
  to,
}: SendResendEmailInput) => {
  if (!resendApiKey) {
    throw new Error("missing_resend_api_key");
  }

  const payload: Record<string, unknown> = {
    from: fromAddress(sender),
    html,
    subject: normalizeEmailSubject(subject),
    text,
    to: [to],
  };

  if (attachments?.length) {
    payload.attachments = attachments;
  }

  if (headers && Object.keys(headers).length > 0) {
    payload.headers = headers;
  }

  if (resendReplyTo) {
    payload.reply_to = [resendReplyTo];
  }

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, RESEND_REQUEST_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch("https://api.resend.com/emails", {
      body: JSON.stringify(payload),
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
        ...(idempotencyKey?.trim()
          ? { "Idempotency-Key": idempotencyKey.trim().slice(0, 256) }
          : {}),
      },
      method: "POST",
      signal: abortController.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("resend_request_timeout");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const responseText = await response.text();

    // The key was already used for this email: an earlier attempt that timed out on
    // our side was delivered. Sending again would only duplicate it.
    if (
      idempotencyKey?.trim() &&
      response.status === 409 &&
      responseText.includes("invalid_idempotent_request")
    ) {
      return { emailId: "" };
    }

    throw new Error(`resend_request_failed:${response.status}:${responseText}`);
  }

  const data = (await response.json()) as { id?: string };

  return {
    emailId: data.id ?? "",
  };
};
