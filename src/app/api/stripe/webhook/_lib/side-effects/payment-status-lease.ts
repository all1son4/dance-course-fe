import { randomBytes } from "node:crypto";

import {
  findPaymentRecordByIntentId,
  isGoogleSheetsRateLimitError,
  type PaymentSheetRecord,
  upsertPaymentRecord,
} from "@/lib/google-sheets";
import { toUtcIso } from "@/lib/time";

type PaymentStatusField = "email_delivery_status" | "with_mentor_alert_status";
type PaymentStatusUpdatedField =
  | "email_delivery_updated_at"
  | "with_mentor_alert_updated_at";

const PAYMENT_PROCESSING_STATUS_PREFIX = "sending:";
const PAYMENT_PROCESSING_LEASE_TTL_MS = 2 * 60 * 1000;
const PURCHASE_ALERT_FALLBACK_DEDUPE_TTL_MS = 10 * 60 * 1000;
const FRESH_PAYMENT_LOOKUP_CACHE_TTL_MS = 30 * 1000;

const fallbackPurchaseAlertDedupe = new Map<string, number>();

const parseTimestamp = (value: string) => {
  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) ? timestamp : 0;
};

const createPaymentProcessingStatus = () =>
  `${PAYMENT_PROCESSING_STATUS_PREFIX}${randomBytes(10).toString("hex")}`;

export const hasFreshFallbackAlertSend = (paymentIntentId: string) => {
  const now = Date.now();

  for (const [key, expiresAt] of fallbackPurchaseAlertDedupe) {
    if (expiresAt <= now) {
      fallbackPurchaseAlertDedupe.delete(key);
    }
  }

  const expiresAt = fallbackPurchaseAlertDedupe.get(paymentIntentId) ?? 0;

  return expiresAt > now;
};

export const markFallbackAlertSent = (paymentIntentId: string) => {
  fallbackPurchaseAlertDedupe.set(
    paymentIntentId,
    Date.now() + PURCHASE_ALERT_FALLBACK_DEDUPE_TTL_MS,
  );
};

const isFreshPaymentProcessingStatus = ({
  status,
  updatedAt,
}: {
  status: string;
  updatedAt: string;
}) =>
  status.startsWith(PAYMENT_PROCESSING_STATUS_PREFIX) &&
  parseTimestamp(updatedAt) + PAYMENT_PROCESSING_LEASE_TTL_MS > Date.now();

const getFreshPaymentRecord = async ({
  fallbackPaymentRecord,
  paymentIntentId,
}: {
  fallbackPaymentRecord: PaymentSheetRecord;
  paymentIntentId: string;
}) => {
  try {
    return (
      (await findPaymentRecordByIntentId(paymentIntentId, {
        cacheTtlMs: FRESH_PAYMENT_LOOKUP_CACHE_TTL_MS,
        source: "sheets",
      })) ?? fallbackPaymentRecord
    );
  } catch (error) {
    if (!isGoogleSheetsRateLimitError(error)) {
      throw error;
    }

    return fallbackPaymentRecord;
  }
};

export const tryAcquirePaymentProcessingLease = async ({
  completedStatuses,
  fallbackPaymentRecord,
  paymentIntentId,
  statusField,
  updatedAtField,
}: {
  completedStatuses: Set<string>;
  fallbackPaymentRecord: PaymentSheetRecord;
  paymentIntentId: string;
  statusField: PaymentStatusField;
  updatedAtField: PaymentStatusUpdatedField;
}) => {
  const latestPaymentRecord = await getFreshPaymentRecord({
    fallbackPaymentRecord,
    paymentIntentId,
  });
  const currentStatus = latestPaymentRecord[statusField].trim();

  if (completedStatuses.has(currentStatus)) {
    return {
      acquired: false,
      paymentRecord: latestPaymentRecord,
    };
  }

  if (
    isFreshPaymentProcessingStatus({
      status: currentStatus,
      updatedAt: latestPaymentRecord[updatedAtField],
    })
  ) {
    return {
      acquired: false,
      paymentRecord: latestPaymentRecord,
    };
  }

  const now = toUtcIso();
  const leaseStatus = createPaymentProcessingStatus();
  await upsertPaymentRecord({
    ...latestPaymentRecord,
    [statusField]: leaseStatus,
    [updatedAtField]: now,
    updated_at: now,
  });

  const verifiedPaymentRecord = await getFreshPaymentRecord({
    fallbackPaymentRecord: latestPaymentRecord,
    paymentIntentId,
  });

  return {
    acquired: verifiedPaymentRecord[statusField].trim() === leaseStatus,
    paymentRecord: verifiedPaymentRecord,
  };
};

const updatePaymentEmailDeliveryStatus = async ({
  paymentRecord,
  status,
}: {
  paymentRecord: PaymentSheetRecord;
  status: "failed" | "sent" | "skipped";
}) => {
  const now = toUtcIso();
  const latestPaymentRecord = await getFreshPaymentRecord({
    fallbackPaymentRecord: paymentRecord,
    paymentIntentId: paymentRecord.payment_intent_id,
  });

  await upsertPaymentRecord({
    ...latestPaymentRecord,
    email_delivery_status: status,
    email_delivery_updated_at: now,
    updated_at: now,
  });
};

export const tryUpdatePaymentEmailDeliveryStatus = async ({
  paymentRecord,
  status,
}: {
  paymentRecord: PaymentSheetRecord;
  status: "failed" | "sent" | "skipped";
}) => {
  try {
    await updatePaymentEmailDeliveryStatus({
      paymentRecord,
      status,
    });
  } catch (statusUpdateError) {
    console.error("Failed to update email delivery status", statusUpdateError);
  }
};

const updatePurchaseAlertStatus = async ({
  paymentRecord,
  status,
}: {
  paymentRecord: PaymentSheetRecord;
  status: "failed" | "sent";
}) => {
  const now = toUtcIso();
  const latestPaymentRecord = await getFreshPaymentRecord({
    fallbackPaymentRecord: paymentRecord,
    paymentIntentId: paymentRecord.payment_intent_id,
  });

  await upsertPaymentRecord({
    ...latestPaymentRecord,
    updated_at: now,
    with_mentor_alert_status: status,
    with_mentor_alert_updated_at: now,
  });
};

export const tryUpdatePurchaseAlertStatus = async ({
  paymentRecord,
  status,
}: {
  paymentRecord: PaymentSheetRecord;
  status: "failed" | "sent";
}) => {
  try {
    await updatePurchaseAlertStatus({
      paymentRecord,
      status,
    });
  } catch (statusUpdateError) {
    console.error("Failed to update purchase alert status", statusUpdateError);
  }
};
