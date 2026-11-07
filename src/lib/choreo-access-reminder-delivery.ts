import {
  findCurrentChoreoAccessReminder,
  listDueChoreoAccessReminders,
} from "@/db/choreo-access-reminders";
import { type ClaimedOutboxJob, enqueueOutboxJob } from "@/db/transactional-outbox";
import { buildChoreoAccessReminderEmail } from "@/lib/email/choreo-access-reminder";
import { sendResendEmail } from "@/lib/email/resend";
import {
  getBuyerPurchaseLine,
  shouldShowOfferToBuyerByOfferId,
} from "@/lib/sellable-products-localization";
import { getTelegramChannelTargetByOfferId } from "@/lib/telegram/config";

const isProduction = () =>
  process.env.VERCEL_ENV === "production" ||
  (!process.env.VERCEL_ENV && process.env.NODE_ENV === "production");
const isEnabled = () =>
  isProduction() || process.env.ALLOW_TEST_MODE_NOTIFICATIONS === "1";

export const enqueueDueChoreoAccessReminders = async (now = new Date()) => {
  const result = { due: 0, enqueued: 0, duplicates: 0, disabled: !isEnabled() };
  if (result.disabled) return result;
  const reminders = await listDueChoreoAccessReminders(now, isProduction());
  result.due = reminders.length;
  for (const reminder of reminders) {
    const queued = await enqueueOutboxJob({
      deduplicationKey: reminder.deduplicationKey,
      kind: "choreo_access_expiry_reminder",
      provider: "resend",
      // One reminder per recipient/channel/expiry, independently of repeat purchases.
      payload: { bindingId: reminder.bindingId },
      recipient: reminder.email,
    });
    if (queued.duplicate) result.duplicates += 1;
    else result.enqueued += 1;
  }
  return result;
};

export const deliverChoreoAccessReminder = async (job: ClaimedOutboxJob) => {
  if (!isEnabled()) return { skipped: true };
  if (
    typeof job.payload.bindingId !== "string" ||
    !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu.test(
      job.payload.bindingId,
    )
  ) {
    throw Object.assign(new Error("choreo_reminder_binding_invalid"), {
      retryable: false,
    });
  }
  const reminder = await findCurrentChoreoAccessReminder({
    bindingId: job.payload.bindingId,
    deduplicationKey: job.deduplicationKey,
    now: new Date(),
    livemode: isProduction(),
  });
  if (!reminder) return { skipped: true };
  if (job.recipient?.trim().toLowerCase() !== reminder.email) {
    throw Object.assign(new Error("choreo_reminder_recipient_mismatch"), {
      retryable: false,
    });
  }
  const purchaseLine =
    getBuyerPurchaseLine({
      locale: reminder.locale,
      offerId: reminder.offerId,
      showOfferLabel: shouldShowOfferToBuyerByOfferId(reminder.offerId),
    }) ||
    reminder.productTitle ||
    "Choreography";
  const target = getTelegramChannelTargetByOfferId({
    offerId: reminder.offerId,
    lessonLanguage: reminder.lessonLanguage,
  });
  const email = buildChoreoAccessReminderEmail({
    title: purchaseLine,
    expiresAt: reminder.expiresAt,
    locale: reminder.locale,
    materialsUrl: target?.chatId === reminder.chatId ? target.materialsUrl : undefined,
  });
  const { emailId } = await sendResendEmail({
    ...email,
    to: reminder.email,
    idempotencyKey: job.deduplicationKey,
  });
  return { externalMessageId: emailId };
};
