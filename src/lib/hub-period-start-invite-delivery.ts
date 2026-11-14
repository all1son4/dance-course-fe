import { getDatabase } from "@/db/client";
import { listStartedHubPeriodsWithoutInvite } from "@/db/hub-period-start";
import { findPaymentRecordByIntentIdFromDatabase } from "@/db/payment-records";
import { type ClaimedOutboxJob, enqueueOutboxJob } from "@/db/transactional-outbox";
import { buildHubPeriodStartInviteEmail } from "@/lib/email/hub-period-start-invite";
import { sendResendEmail } from "@/lib/email/resend";
import { ensureOnlineGroupAccessForPayment } from "@/lib/telegram/online-group-access";

const isProduction = () =>
  process.env.VERCEL_ENV === "production" ||
  (!process.env.VERCEL_ENV && process.env.NODE_ENV === "production");
const isEnabled = () =>
  isProduction() || process.env.ALLOW_TEST_MODE_NOTIFICATIONS === "1";

const nonRetryable = (message: string) =>
  Object.assign(new Error(message), { retryable: false });

/**
 * HUB-D37, run daily: one job per paid Hub period that began without an invite. The
 * key names the start, so a period whose start moved gets its own job.
 */
export const enqueueStartedHubPeriodInvites = async (now = new Date()) => {
  const result = { due: 0, enqueued: 0, duplicates: 0, disabled: !isEnabled() };
  if (result.disabled) return result;

  const periods = await listStartedHubPeriodsWithoutInvite(getDatabase(), {
    livemode: isProduction(),
    now,
  });
  result.due = periods.length;

  for (const period of periods) {
    const queued = await enqueueOutboxJob({
      deduplicationKey: `hub_period_start_invite:${period.entitlementId}:${period.startsAt.toISOString()}`,
      kind: "hub_period_start_invite",
      payload: { paymentIntentId: period.paymentIntentId },
      provider: "resend",
      recipient: period.email,
    });
    if (queued.duplicate) result.duplicates += 1;
    else result.enqueued += 1;
  }

  return result;
};

/** Creates the invite through the ordinary delivery and mails it to the buyer. */
export const deliverHubPeriodStartInvite = async (job: ClaimedOutboxJob) => {
  if (!isEnabled()) return { skipped: true };

  const paymentIntentId =
    typeof job.payload.paymentIntentId === "string" ? job.payload.paymentIntentId : "";
  if (!paymentIntentId) throw nonRetryable("hub_start_invite_payment_missing");

  const paymentRecord = await findPaymentRecordByIntentIdFromDatabase(paymentIntentId);
  if (!paymentRecord) throw nonRetryable("hub_start_invite_purchase_not_found");

  const recipient = job.recipient?.trim().toLowerCase() ?? "";
  if (!recipient || recipient !== paymentRecord.customer_email.trim().toLowerCase()) {
    throw nonRetryable("hub_start_invite_recipient_mismatch");
  }

  const [access] = (await ensureOnlineGroupAccessForPayment(paymentRecord)) ?? [];

  // Already in the Hub, ended meanwhile, or the start moved later: nothing to send now.
  if (
    !access ||
    access.status === "active" ||
    access.status === "expired" ||
    access.status === "scheduled"
  ) {
    return { skipped: true };
  }

  if (access.status !== "ready" || !access.accessUrl) {
    throw new Error("hub_start_invite_unavailable");
  }

  const email = buildHubPeriodStartInviteEmail({
    accessUrl: access.accessUrl,
    expiresAt: access.accessExpiresAt ? new Date(access.accessExpiresAt) : null,
    locale: paymentRecord.checkout_locale,
  });
  const { emailId } = await sendResendEmail({
    ...email,
    idempotencyKey: job.deduplicationKey,
    to: recipient,
  });

  return { externalMessageId: emailId };
};
