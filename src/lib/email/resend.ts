const resendApiKey = process.env.RESEND_API_KEY?.trim() ?? "";
const resendFromEmail = process.env.RESEND_FROM_EMAIL?.trim() ?? "onboarding@resend.dev";
const resendReplyTo = process.env.RESEND_REPLY_TO?.trim() ?? "";
const RESEND_REQUEST_TIMEOUT_MS = 4_000;

export type SendResendEmailInput = {
  attachments?: Array<{
    content: string;
    filename: string;
  }>;
  html: string;
  subject: string;
  text: string;
  to: string;
};

export const isResendConfigured = () => Boolean(resendApiKey);

export const sendResendEmail = async ({
  attachments,
  html,
  subject,
  text,
  to,
}: SendResendEmailInput) => {
  if (!resendApiKey) {
    throw new Error("missing_resend_api_key");
  }

  const payload: Record<string, unknown> = {
    from: resendFromEmail,
    html,
    subject,
    text,
    to: [to],
  };

  if (attachments?.length) {
    payload.attachments = attachments;
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

    throw new Error(`resend_request_failed:${response.status}:${responseText}`);
  }

  const data = (await response.json()) as { id?: string };

  return {
    emailId: data.id ?? "",
  };
};
