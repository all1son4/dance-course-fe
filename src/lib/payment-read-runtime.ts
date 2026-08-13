import { createHash } from "node:crypto";

import { getDomainPersistenceMode } from "@/db/domain-persistence";
import { domainRepositories } from "@/db/domain-repositories";
import type { StripeInboxReadModel } from "@/db/stripe-event-inbox";
import {
  findLatestPaymentRecordByCheckoutSessionId,
  findLatestSucceededPaymentRecordByCheckoutSessionId,
  findPaymentRecordByIntentId,
  type PaymentSheetRecord,
} from "@/lib/google-sheets";
import type { StripeEventSheetRecord } from "@/lib/google-sheets-schema";

type PaymentRecord = PaymentSheetRecord | null;

export type PaymentReadShadowComparison = {
  differingFields: string[];
  keyHash: string;
  recordType: "payment" | "stripe_event";
  status: "match" | "mismatch" | "database_missing" | "sheets_missing";
};

export type PaymentReadDependencies = {
  database: {
    findByCheckoutSessionId: (checkoutSessionId: string) => Promise<PaymentRecord>;
    findByPaymentIntentId: (paymentIntentId: string) => Promise<PaymentRecord>;
    findStripeEvent: (eventId: string) => Promise<StripeInboxReadModel | null>;
  };
  legacy: {
    findByCheckoutSessionId: (checkoutSessionId: string) => Promise<PaymentRecord>;
    findByPaymentIntentId: (paymentIntentId: string) => Promise<PaymentRecord>;
  };
  sheets: {
    findByCheckoutSessionId: (checkoutSessionId: string) => Promise<PaymentRecord>;
    findByPaymentIntentId: (paymentIntentId: string) => Promise<PaymentRecord>;
  };
};

type PaymentSource = Pick<
  PaymentReadDependencies["database"],
  "findByCheckoutSessionId" | "findByPaymentIntentId"
>;

const defaultDependencies: PaymentReadDependencies = {
  database: {
    findByCheckoutSessionId: domainRepositories.paymentReads.findByCheckoutSessionId,
    findByPaymentIntentId: domainRepositories.paymentReads.findByPaymentIntentId,
    findStripeEvent: domainRepositories.stripeInbox.findReadModel,
  },
  legacy: {
    findByCheckoutSessionId: (checkoutSessionId) =>
      findLatestSucceededPaymentRecordByCheckoutSessionId(checkoutSessionId),
    findByPaymentIntentId: (paymentIntentId) =>
      findPaymentRecordByIntentId(paymentIntentId),
  },
  sheets: {
    findByCheckoutSessionId: async (checkoutSessionId) => {
      const record = await findLatestPaymentRecordByCheckoutSessionId(checkoutSessionId, {
        source: "sheets",
      });

      return record?.outcome === "succeeded" ? record : null;
    },
    findByPaymentIntentId: (paymentIntentId) =>
      findPaymentRecordByIntentId(paymentIntentId, {
        cacheTtlMs: 0,
        source: "sheets",
      }),
  },
};

const PAYMENT_COMPARISON_FIELDS = [
  "amount",
  "checkout_currency",
  "checkout_locale",
  "checkout_session_id",
  "currency",
  "customer_address",
  "customer_city",
  "customer_country",
  "customer_email",
  "customer_full_name",
  "customer_nickname",
  "customer_postal_code",
  "first_seen_at",
  "last_payment_error_code",
  "last_payment_error_message",
  "latest_event_id",
  "latest_event_type",
  "lesson_language",
  "offer_id",
  "offer_label",
  "outcome",
  "payment_intent_id",
  "product_id",
  "product_title",
  "purchase_item",
  "status",
] as const satisfies readonly (keyof PaymentSheetRecord)[];

const normalizeTimestamp = (value: string) => {
  const timestamp = Date.parse(value.trim());

  return Number.isFinite(timestamp)
    ? new Date(Math.floor(timestamp / 1000) * 1000).toISOString()
    : value.trim();
};

const normalizePaymentField = (
  field: (typeof PAYMENT_COMPARISON_FIELDS)[number],
  value: string,
) => {
  if (field === "customer_email") {
    return value.trim().toLowerCase();
  }

  if (field === "first_seen_at") {
    return normalizeTimestamp(value);
  }

  return value.trim();
};

const hashKey = (value: string) => createHash("sha256").update(value).digest("hex");

const comparePaymentRecords = ({
  databaseRecord,
  key,
  sheetsRecord,
}: {
  databaseRecord: PaymentRecord;
  key: string;
  sheetsRecord: PaymentRecord;
}): PaymentReadShadowComparison => {
  const base = {
    differingFields: [] as string[],
    keyHash: hashKey(key),
    recordType: "payment" as const,
  };

  if (!databaseRecord && !sheetsRecord) {
    return { ...base, status: "match" };
  }

  if (!databaseRecord) {
    return { ...base, status: "database_missing" };
  }

  if (!sheetsRecord) {
    return { ...base, status: "sheets_missing" };
  }

  const differingFields = PAYMENT_COMPARISON_FIELDS.filter(
    (field) =>
      normalizePaymentField(field, databaseRecord[field]) !==
      normalizePaymentField(field, sheetsRecord[field]),
  );

  return {
    ...base,
    differingFields: [...differingFields],
    status: differingFields.length === 0 ? "match" : "mismatch",
  };
};

const compareStripeEventRecords = ({
  databaseRecord,
  eventId,
  sheetsRecord,
}: {
  databaseRecord: StripeInboxReadModel | null;
  eventId: string;
  sheetsRecord: StripeEventSheetRecord | null;
}): PaymentReadShadowComparison => {
  const base = {
    differingFields: [] as string[],
    keyHash: hashKey(`stripe_event:${eventId}`),
    recordType: "stripe_event" as const,
  };

  if (!databaseRecord) {
    return { ...base, status: "database_missing" };
  }

  const databaseIsFinal =
    databaseRecord.processingStatus === "processed" ||
    databaseRecord.processingStatus === "skipped";

  if (!sheetsRecord) {
    return { ...base, status: databaseIsFinal ? "sheets_missing" : "match" };
  }

  if (!databaseIsFinal) {
    return {
      ...base,
      differingFields: ["processing_status"],
      status: "mismatch",
    };
  }

  const differingFields = [
    databaseRecord.eventType.trim() === sheetsRecord.event_type.trim()
      ? null
      : "event_type",
    (databaseRecord.paymentIntentId ?? "").trim() ===
    sheetsRecord.payment_intent_id.trim()
      ? null
      : "payment_intent_id",
    (databaseRecord.paymentStatus ?? "").trim() === sheetsRecord.status.trim()
      ? null
      : "status",
    (databaseRecord.outcome ?? "").trim() === sheetsRecord.outcome.trim()
      ? null
      : "outcome",
  ].filter((field): field is string => field !== null);

  return {
    ...base,
    differingFields,
    status: differingFields.length === 0 ? "match" : "mismatch",
  };
};

const reportShadowComparison = (comparison: PaymentReadShadowComparison) => {
  if (comparison.status !== "match") {
    console.warn("Payment read shadow mismatch", comparison);
  }
};

const reportShadowFailure = (
  recordType: PaymentReadShadowComparison["recordType"],
  error: unknown,
) => {
  console.warn("Payment read shadow comparison failed", {
    errorName: error instanceof Error ? error.name : "UnknownError",
    recordType,
  });
};

const resolveAccessPaymentRecord = async ({
  checkoutSessionId,
  paymentIntentId,
  source,
}: {
  checkoutSessionId: string;
  paymentIntentId: string;
  source: PaymentSource;
}) => {
  const paymentIntentRecord = paymentIntentId
    ? await source.findByPaymentIntentId(paymentIntentId)
    : null;

  if (paymentIntentRecord) {
    return paymentIntentRecord;
  }

  const checkoutRecord = await source.findByCheckoutSessionId(checkoutSessionId);

  return checkoutRecord?.outcome === "succeeded" ? checkoutRecord : null;
};

export const getPaymentReadRuntime = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
) => getDomainPersistenceMode("paymentEvents", environment);

export const findPaymentAccessRecord = async ({
  checkoutSessionId,
  dependencies = defaultDependencies,
  environment = process.env,
  onShadowComparison = reportShadowComparison,
  paymentIntentId,
}: {
  checkoutSessionId: string;
  dependencies?: PaymentReadDependencies;
  environment?: Readonly<Record<string, string | undefined>>;
  onShadowComparison?: (comparison: PaymentReadShadowComparison) => void;
  paymentIntentId: string;
}): Promise<PaymentRecord> => {
  const mode = getPaymentReadRuntime(environment);

  if (mode === "database") {
    return resolveAccessPaymentRecord({
      checkoutSessionId,
      paymentIntentId,
      source: dependencies.database,
    });
  }

  const primaryRecord = await resolveAccessPaymentRecord({
    checkoutSessionId,
    paymentIntentId,
    source: dependencies.legacy,
  });

  if (mode === "shadow") {
    try {
      const [databaseRecord, sheetsRecord] = await Promise.all([
        resolveAccessPaymentRecord({
          checkoutSessionId,
          paymentIntentId,
          source: dependencies.database,
        }),
        resolveAccessPaymentRecord({
          checkoutSessionId,
          paymentIntentId,
          source: dependencies.sheets,
        }),
      ]);

      onShadowComparison(
        comparePaymentRecords({
          databaseRecord,
          key: `payment:${paymentIntentId}:${checkoutSessionId}`,
          sheetsRecord,
        }),
      );
    } catch (error) {
      reportShadowFailure("payment", error);
    }
  }

  return primaryRecord;
};

export const observeStripeEventReadShadow = async ({
  dependencies = defaultDependencies,
  environment = process.env,
  eventId,
  onShadowComparison = reportShadowComparison,
  sheetsRecord,
}: {
  dependencies?: PaymentReadDependencies;
  environment?: Readonly<Record<string, string | undefined>>;
  eventId: string;
  onShadowComparison?: (comparison: PaymentReadShadowComparison) => void;
  sheetsRecord: StripeEventSheetRecord | null;
}) => {
  if (getPaymentReadRuntime(environment) !== "shadow") {
    return;
  }

  try {
    const databaseRecord = await dependencies.database.findStripeEvent(eventId);

    onShadowComparison(
      compareStripeEventRecords({ databaseRecord, eventId, sheetsRecord }),
    );
  } catch (error) {
    reportShadowFailure("stripe_event", error);
  }
};
