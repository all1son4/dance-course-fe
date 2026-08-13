import { eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { getDomainPersistenceMode } from "@/db/domain-persistence";
import { findPaymentRecordByIntentIdFromDatabase } from "@/db/payment-records";
import { purchases } from "@/db/schema";
import { type ClaimedOutboxJob, processNextOutboxJob } from "@/db/transactional-outbox";
import { appendSuccessfulCustomerRecord } from "@/lib/google-sheets";
import type { SuccessfulCustomersSheetRecord } from "@/lib/google-sheets-schema";

export const SHEETS_EXPORT_OUTBOX_KINDS = ["successful_customer_export"] as const;

type AppendSuccessfulCustomerRecord = (
  record: SuccessfulCustomersSheetRecord,
  options: { mirrorToDatabase: false },
) => Promise<unknown>;

class NonRetryableSheetsExportError extends Error {
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = "NonRetryableSheetsExportError";
  }
}

const requirePayloadString = (
  payload: Record<string, unknown>,
  field: string,
): string => {
  const value = payload[field];
  const normalizedValue = typeof value === "string" ? value.trim() : "";

  if (!normalizedValue) {
    throw new NonRetryableSheetsExportError(`sheets_export_${field}_required`);
  }

  return normalizedValue;
};

export const isSheetsExportEnabled = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
) => getDomainPersistenceMode("sheetsExport", environment) !== "database";

const getPurchaseItemLabel = (
  paymentRecord: NonNullable<
    Awaited<ReturnType<typeof findPaymentRecordByIntentIdFromDatabase>>
  >,
) =>
  paymentRecord.purchase_item.trim() ||
  [paymentRecord.product_title.trim(), paymentRecord.offer_label.trim()]
    .filter(Boolean)
    .join(" — ");

const getCustomerFullAddress = (
  paymentRecord: NonNullable<
    Awaited<ReturnType<typeof findPaymentRecordByIntentIdFromDatabase>>
  >,
) =>
  [
    paymentRecord.customer_address.trim(),
    paymentRecord.customer_city.trim(),
    paymentRecord.customer_postal_code.trim(),
  ]
    .filter(Boolean)
    .join(", ");

const loadSuccessfulCustomerProjection = async (
  job: ClaimedOutboxJob,
): Promise<SuccessfulCustomersSheetRecord> => {
  if (job.kind !== "successful_customer_export") {
    throw new NonRetryableSheetsExportError("sheets_export_kind_unsupported");
  }

  if (job.provider !== "google_sheets") {
    throw new NonRetryableSheetsExportError("sheets_export_provider_mismatch");
  }

  const paymentIntentId = requirePayloadString(job.payload, "paymentIntentId");
  const [purchase, paymentRecord] = await Promise.all([
    getDatabase()
      .select({ id: purchases.id, source: purchases.source })
      .from(purchases)
      .where(eq(purchases.paymentIntentId, paymentIntentId))
      .limit(1)
      .then(([row]) => row ?? null),
    findPaymentRecordByIntentIdFromDatabase(paymentIntentId),
  ]);

  if (!purchase || (job.purchaseId && job.purchaseId !== purchase.id)) {
    throw new NonRetryableSheetsExportError("sheets_export_purchase_mismatch");
  }

  const payloadSource =
    typeof job.payload.source === "string" ? job.payload.source.trim() : "";

  if (payloadSource && payloadSource !== purchase.source) {
    throw new NonRetryableSheetsExportError("sheets_export_source_mismatch");
  }

  if (!paymentRecord) {
    throw new Error("sheets_export_payment_projection_missing");
  }

  // This explicit allowlist is the complete Sheets contract. Outbox metadata,
  // provider payloads, access tokens, invite links, and credentials cannot cross it.
  return {
    customer_country: paymentRecord.customer_country,
    customer_email: paymentRecord.customer_email,
    customer_full_address: getCustomerFullAddress(paymentRecord),
    customer_full_name: paymentRecord.customer_full_name,
    customer_nickname: paymentRecord.customer_nickname,
    offer_id: paymentRecord.offer_id,
    offer_label: paymentRecord.offer_label,
    payment_intent_id: paymentIntentId,
    product_id: paymentRecord.product_id,
    product_title: paymentRecord.product_title,
    purchase_item: getPurchaseItemLabel(paymentRecord),
  };
};

export const deliverSheetsExportOutboxJob = async (
  job: ClaimedOutboxJob,
  {
    appendSuccessfulCustomer = appendSuccessfulCustomerRecord,
    environment = process.env,
  }: {
    appendSuccessfulCustomer?: AppendSuccessfulCustomerRecord;
    environment?: Readonly<Record<string, string | undefined>>;
  } = {},
) => {
  if (!isSheetsExportEnabled(environment)) {
    return { skipped: true };
  }

  const projection = await loadSuccessfulCustomerProjection(job);

  await appendSuccessfulCustomer(projection, { mirrorToDatabase: false });

  return {};
};

export const runSheetsExportOutboxJobs = async ({
  limit = 16,
}: {
  limit?: number;
} = {}) => {
  const counts = {
    dead_letter: 0,
    empty: 0,
    retry: 0,
    sent: 0,
    skipped: 0,
  };

  for (let index = 0; index < limit; index += 1) {
    const result = await processNextOutboxJob({
      deliver: deliverSheetsExportOutboxJob,
      kinds: [...SHEETS_EXPORT_OUTBOX_KINDS],
    });

    counts[result.status] += 1;

    if (result.status === "empty") {
      break;
    }
  }

  return counts;
};
