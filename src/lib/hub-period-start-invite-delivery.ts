import { isOnlineGroupLibraryOfferId } from "@/constants/sellable-products";
import { getDatabase } from "@/db/client";
import {
  listStartedHubPeriodsWithoutInvite,
  listStartedPlusHubsWithoutInvite,
} from "@/db/hub-period-start";
import { findMyAccessCustomerIdForPaymentIntent } from "@/db/my-access";
import { findPaymentRecordByIntentIdFromDatabase } from "@/db/payment-records";
import { type ClaimedOutboxJob, enqueueOutboxJob } from "@/db/transactional-outbox";
import { areNotificationsEnabled, isProductionDeployment } from "@/lib/deployment";
import { buildHubPeriodStartInviteEmail } from "@/lib/email/hub-period-start-invite";
import { sendResendEmail } from "@/lib/email/resend";
import { buildMyAccessUrl } from "@/lib/my-access/link";
import { ensureOnlineGroupAccessForPayment } from "@/lib/telegram/online-group-access";

const nonRetryable = (message: string) =>
  Object.assign(new Error(message), { retryable: false });

/**
 * HUB-D37, run daily: one job per paid Hub period that began without an invite. The
 * key names the start, so a period whose start moved gets its own job.
 */
export const enqueueStartedHubPeriodInvites = async (now = new Date()) => {
  const result = {
    due: 0,
    enqueued: 0,
    duplicates: 0,
    disabled: !areNotificationsEnabled(),
  };
  if (result.disabled) return result;

  const periods = await listStartedHubPeriodsWithoutInvite(getDatabase(), {
    livemode: isProductionDeployment(),
    now,
  });
  result.due = periods.length;

  // HUB-D43: Plus buyers outside the Hub get their invite on the cohort start day.
  const plusHubs = await listStartedPlusHubsWithoutInvite(getDatabase(), {
    livemode: isProductionDeployment(),
    now,
  });
  result.due += plusHubs.length;

  const jobs = [
    ...periods.map((period) => ({
      deduplicationKey: `hub_period_start_invite:${period.entitlementId}:${period.startsAt.toISOString()}`,
      email: period.email,
      paymentIntentId: period.paymentIntentId,
    })),
    ...plusHubs.map((plus) => ({
      deduplicationKey: `hub_period_start_invite:plus:${plus.purchaseId}:${plus.startsAt.toISOString()}`,
      email: plus.email,
      paymentIntentId: plus.paymentIntentId,
    })),
  ];

  for (const job of jobs) {
    const queued = await enqueueOutboxJob({
      deduplicationKey: job.deduplicationKey,
      kind: "hub_period_start_invite",
      payload: { paymentIntentId: job.paymentIntentId },
      provider: "resend",
      recipient: job.email,
    });
    if (queued.duplicate) result.duplicates += 1;
    else result.enqueued += 1;
  }

  return result;
};

/** Creates the invite through the ordinary delivery and mails it to the buyer. */
export const deliverHubPeriodStartInvite = async (job: ClaimedOutboxJob) => {
  if (!areNotificationsEnabled()) return { skipped: true };

  const paymentIntentId =
    typeof job.payload.paymentIntentId === "string" ? job.payload.paymentIntentId : "";
  if (!paymentIntentId) throw nonRetryable("hub_start_invite_payment_missing");

  const paymentRecord = await findPaymentRecordByIntentIdFromDatabase(paymentIntentId);
  if (!paymentRecord) throw nonRetryable("hub_start_invite_purchase_not_found");

  const recipient = job.recipient?.trim().toLowerCase() ?? "";
  if (!recipient || recipient !== paymentRecord.customer_email.trim().toLowerCase()) {
    throw nonRetryable("hub_start_invite_recipient_mismatch");
  }

  // A Hub purchase has one access; a Plus purchase also has its main group.
  const access = (await ensureOnlineGroupAccessForPayment(paymentRecord))?.find(
    (candidate) => candidate.accessKey === "inspiration-hub",
  );

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
    variant: isOnlineGroupLibraryOfferId(paymentRecord.offer_id) ? "plus" : "period",
    myAccessUrl: buildMyAccessUrl(
      await findMyAccessCustomerIdForPaymentIntent(getDatabase(), paymentIntentId).catch(
        () => null,
      ),
      paymentRecord.checkout_locale,
    ),
  });
  const { emailId } = await sendResendEmail({
    ...email,
    sender: "hello",
    idempotencyKey: job.deduplicationKey,
    to: recipient,
  });

  return { externalMessageId: emailId };
};
