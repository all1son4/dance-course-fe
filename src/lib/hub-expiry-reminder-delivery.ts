import { SELLABLE_PRODUCTS } from "@/constants/sellable-products";
import { getDatabase } from "@/db/client";
import {
  listHubReminderPeriods,
  listHubReminderPlusRights,
} from "@/db/hub-expiry-reminders";
import { findMyAccessCustomerIdForPaymentIntent } from "@/db/my-access";
import { type ClaimedOutboxJob, enqueueOutboxJob } from "@/db/transactional-outbox";
import { areNotificationsEnabled, isProductionDeployment } from "@/lib/deployment";
import { buildHubExpiryReminderEmail } from "@/lib/email/hub-expiry-reminder";
import { sendResendEmail } from "@/lib/email/resend";
import {
  type HubExpiryReminder,
  planHubExpiryReminders,
} from "@/lib/inspiration-hub/expiry-reminders";
import { buildMyAccessUrl } from "@/lib/my-access/link";
import { getOnlineGroupSale } from "@/lib/online-group-sale";
import { logSafeError } from "@/lib/safe-error-log";
import { getProductSaleState } from "@/lib/sales-availability";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const nonRetryable = (message: string) =>
  Object.assign(new Error(message), { retryable: false });

const planReminders = async (now: Date, telegramUserId?: string) => {
  const database = getDatabase();
  const periods = await listHubReminderPeriods(database, {
    livemode: isProductionDeployment(),
    telegramUserId,
  });
  const owners = [
    ...new Set(
      periods.flatMap((period) => (period.telegramUserId ? [period.telegramUserId] : [])),
    ),
  ];
  const plusRights = await listHubReminderPlusRights(database, owners);

  return planHubExpiryReminders({ now, periods, plusRights });
};

/** HUB-06, run daily: one job per chain that is 7 or 3 days from its end. */
export const enqueueDueHubExpiryReminders = async (now = new Date()) => {
  const result = {
    due: 0,
    enqueued: 0,
    duplicates: 0,
    disabled: !areNotificationsEnabled(),
  };
  if (result.disabled) return result;

  const reminders = await planReminders(now);
  result.due = reminders.length;

  for (const reminder of reminders) {
    const queued = await enqueueOutboxJob({
      deduplicationKey: reminder.deduplicationKey,
      kind: "hub_expiry_reminder",
      payload: { paymentIntentId: reminder.paymentIntentId },
      provider: "resend",
      recipient: reminder.email,
    });
    if (queued.duplicate) result.duplicates += 1;
    else result.enqueued += 1;
  }

  return result;
};

/** Section 9: Standard/Plus are suggested only for a cohort on sale starting within a week. */
const findOnlineCohortStart = async (now: Date): Promise<Date | null> => {
  try {
    const productId = SELLABLE_PRODUCTS["online-group-anna-strok"].id;
    if ((await getProductSaleState(productId)) !== "open") return null;

    const sale = await getOnlineGroupSale();
    const startsAt = sale.campaign?.startsAt ?? null;

    return sale.open &&
      startsAt &&
      startsAt > now &&
      startsAt.getTime() - now.getTime() <= WEEK_MS
      ? startsAt
      : null;
  } catch (error) {
    logSafeError("Failed to read the Online Group sale for a Hub reminder", error);
    return null;
  }
};

/**
 * Checks again right before sending: a renewal, a new Plus or a moved date since
 * the cron ran makes the planned reminder disappear, and the job ends quietly.
 */
export const deliverHubExpiryReminder = async (job: ClaimedOutboxJob) => {
  if (!areNotificationsEnabled()) return { skipped: true };

  const paymentIntentId =
    typeof job.payload.paymentIntentId === "string" ? job.payload.paymentIntentId : "";
  if (!paymentIntentId) throw nonRetryable("hub_reminder_payment_missing");

  const now = new Date();
  const periods = await listHubReminderPeriods(getDatabase(), {
    livemode: isProductionDeployment(),
  });
  const owner = periods.find((period) => period.paymentIntentId === paymentIntentId);
  const reminder: HubExpiryReminder | undefined = (
    await planReminders(now, owner?.telegramUserId ?? undefined)
  ).find((candidate) => candidate.deduplicationKey === job.deduplicationKey);

  if (!reminder) return { skipped: true };

  const recipient = job.recipient?.trim().toLowerCase() ?? "";
  if (!recipient || recipient !== reminder.email) {
    throw nonRetryable("hub_reminder_recipient_mismatch");
  }

  const customerId = await findMyAccessCustomerIdForPaymentIntent(
    getDatabase(),
    reminder.paymentIntentId,
  ).catch(() => null);
  const email = buildHubExpiryReminderEmail({
    endsAt: reminder.endsAt,
    kind: reminder.kind,
    locale: reminder.locale,
    myAccessUrl: buildMyAccessUrl(customerId, reminder.locale),
    onlineCohortStartsAt: await findOnlineCohortStart(now),
  });
  const { emailId } = await sendResendEmail({
    ...email,
    sender: "hello",
    idempotencyKey: job.deduplicationKey,
    to: recipient,
  });

  return { externalMessageId: emailId };
};
