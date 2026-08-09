import { eq } from "drizzle-orm";

import { getDatabase } from "./client";
import {
  getPaymentOutcomeTransitionCondition,
  type PaymentOutcome,
} from "./payment-outcome-policy";
import {
  accessEntitlements,
  customers,
  invoices,
  productOffers,
  products,
  purchases,
} from "./schema";
import {
  type EnqueueOutboxJobInput,
  enqueueOutboxJobInTransaction,
} from "./transactional-outbox";

type DatabaseTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

export type PaymentProjectionCommand = {
  access: {
    accessKey: string;
    accessWorkflow: string | null;
    currentTokenId: string | null;
    deliveryChannel: string | null;
    expiresAt: Date | null;
    externalTargetType: "telegram_chat" | "telegram_bot" | "manual" | null;
    revokedAt: Date | null;
    startsAt: Date | null;
    status:
      | "pending"
      | "not_required"
      | "token_issued"
      | "activated"
      | "expired"
      | "revoked"
      | "left_channel"
      | "link_failed"
      | "manual_pending"
      | "manual_done";
    telegramChatId: string | null;
    telegramUserId: string | null;
    telegramUsername: string | null;
  } | null;
  catalog: {
    offerExternalId: string | null;
    productExternalId: string | null;
  };
  customer: {
    addressLine: string | null;
    city: string | null;
    country: string | null;
    email: string | null;
    fullName: string | null;
    normalizedEmail: string | null;
    postalCode: string | null;
    stripeCustomerId: string | null;
    telegramUsername: string | null;
  };
  invoice: {
    amountMinor: number;
    buyerAddressSnapshot: string | null;
    buyerEmailSnapshot: string | null;
    buyerNameSnapshot: string | null;
    currency: "pln" | "eur";
    invoiceNumber: string;
    issuedAt: Date;
    sequenceMonth: number;
    sequenceNumber: number;
    sequenceYear: number;
  } | null;
  firstSeenAt: Date;
  livemode: boolean;
  outboxJobs: EnqueueOutboxJobInput[];
  paymentIntentId: string;
  projectedAt: Date;
  purchase: {
    amountMinor: number;
    checkoutCurrency: "pln" | "eur" | null;
    checkoutLocale: "ru" | "en" | "pl" | null;
    checkoutSessionId: string | null;
    currency: "pln" | "eur";
    customerAddressLineSnapshot: string | null;
    customerCitySnapshot: string | null;
    customerCountrySnapshot: string | null;
    customerEmailSnapshot: string | null;
    customerFullNameSnapshot: string | null;
    customerPostalCodeSnapshot: string | null;
    customerTelegramUsernameSnapshot: string | null;
    inspirationChatIdSnapshot: string | null;
    lastPaymentErrorCode: string | null;
    lastPaymentErrorMessage: string | null;
    latestEventId: string | null;
    latestEventType: string | null;
    lessonLanguage: "ru" | "en" | null;
    offerLabelSnapshot: string | null;
    outcome: PaymentOutcome;
    productTitleSnapshot: string | null;
    purchaseItemSnapshot: string | null;
    settlementAmountMinor: number | null;
    settlementCurrency: string | null;
    source: "stripe" | "admin_offer_link";
    stripeBalanceTransactionId: string | null;
    stripeExchangeRate: string | null;
    stripeFeeAmountMinor: number | null;
    stripeNetAmountMinor: number | null;
    stripeStatus: string;
    succeededAt: Date | null;
    updatedAt: Date;
  };
};

type ExistingPurchaseSnapshot = {
  settlementAmountMinor: number | null;
  settlementCurrency: string | null;
  stripeBalanceTransactionId: string | null;
  stripeExchangeRate: string | null;
  stripeFeeAmountMinor: number | null;
  stripeNetAmountMinor: number | null;
  succeededAt: Date | null;
};

const preferExistingValue = <T>(incoming: T | null, existing: T | null | undefined) =>
  incoming ?? existing ?? null;

const upsertCustomer = async (
  transaction: DatabaseTransaction,
  command: PaymentProjectionCommand,
) => {
  const { customer } = command;
  let customerId: string | null = null;

  if (customer.stripeCustomerId) {
    const [existing] = await transaction
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.stripeCustomerId, customer.stripeCustomerId))
      .limit(1);

    customerId = existing?.id ?? null;
  }

  if (!customerId && customer.normalizedEmail) {
    const [existing] = await transaction
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.normalizedEmail, customer.normalizedEmail))
      .limit(1);

    customerId = existing?.id ?? null;
  }

  const values = {
    ...customer,
    updatedAt: command.projectedAt,
  };

  if (customerId) {
    await transaction.update(customers).set(values).where(eq(customers.id, customerId));
    return customerId;
  }

  if (!customer.normalizedEmail && !customer.stripeCustomerId) {
    return null;
  }

  const [inserted] = await transaction
    .insert(customers)
    .values(values)
    .returning({ id: customers.id });

  return inserted.id;
};

const resolveCatalog = async (
  transaction: DatabaseTransaction,
  command: PaymentProjectionCommand,
) => {
  const { offerExternalId, productExternalId } = command.catalog;
  const [offer] = offerExternalId
    ? await transaction
        .select({ id: productOffers.id, productId: productOffers.productId })
        .from(productOffers)
        .where(eq(productOffers.externalOfferId, offerExternalId))
        .limit(1)
    : [];
  const [product] = productExternalId
    ? await transaction
        .select({ id: products.id })
        .from(products)
        .where(eq(products.externalProductId, productExternalId))
        .limit(1)
    : [];

  return {
    offerId: offer?.id ?? null,
    productId: product?.id ?? offer?.productId ?? null,
  };
};

const getExistingPurchase = async (
  transaction: DatabaseTransaction,
  paymentIntentId: string,
): Promise<ExistingPurchaseSnapshot | undefined> => {
  const [existing] = await transaction
    .select({
      settlementAmountMinor: purchases.settlementAmountMinor,
      settlementCurrency: purchases.settlementCurrency,
      stripeBalanceTransactionId: purchases.stripeBalanceTransactionId,
      stripeExchangeRate: purchases.stripeExchangeRate,
      stripeFeeAmountMinor: purchases.stripeFeeAmountMinor,
      stripeNetAmountMinor: purchases.stripeNetAmountMinor,
      succeededAt: purchases.succeededAt,
    })
    .from(purchases)
    .where(eq(purchases.paymentIntentId, paymentIntentId))
    .limit(1);

  return existing;
};

export const projectPaymentStateInTransaction = async ({
  command,
  transaction,
}: {
  command: PaymentProjectionCommand;
  transaction: DatabaseTransaction;
}) => {
  const paymentIntentId = command.paymentIntentId.trim();

  if (!paymentIntentId) {
    throw new Error("payment_projection_payment_intent_id_required");
  }

  const customerId = await upsertCustomer(transaction, command);
  const catalog = await resolveCatalog(transaction, command);
  const existingPurchase = await getExistingPurchase(transaction, paymentIntentId);
  const incomingOutcome = command.purchase.outcome;
  const purchaseValues = {
    ...command.purchase,
    customerId,
    offerExternalId: command.catalog.offerExternalId,
    offerId: catalog.offerId,
    productExternalId: command.catalog.productExternalId,
    productId: catalog.productId,
    settlementAmountMinor: preferExistingValue(
      command.purchase.settlementAmountMinor,
      existingPurchase?.settlementAmountMinor,
    ),
    settlementCurrency: preferExistingValue(
      command.purchase.settlementCurrency,
      existingPurchase?.settlementCurrency,
    ),
    stripeBalanceTransactionId: preferExistingValue(
      command.purchase.stripeBalanceTransactionId,
      existingPurchase?.stripeBalanceTransactionId,
    ),
    stripeExchangeRate: preferExistingValue(
      command.purchase.stripeExchangeRate,
      existingPurchase?.stripeExchangeRate,
    ),
    stripeFeeAmountMinor: preferExistingValue(
      command.purchase.stripeFeeAmountMinor,
      existingPurchase?.stripeFeeAmountMinor,
    ),
    stripeNetAmountMinor: preferExistingValue(
      command.purchase.stripeNetAmountMinor,
      existingPurchase?.stripeNetAmountMinor,
    ),
    succeededAt: command.purchase.succeededAt ?? existingPurchase?.succeededAt ?? null,
  };
  const [savedPurchase] = await transaction
    .insert(purchases)
    .values({
      ...purchaseValues,
      firstSeenAt: command.firstSeenAt,
      livemode: command.livemode,
      paymentIntentId,
    })
    .onConflictDoUpdate({
      set: purchaseValues,
      setWhere: getPaymentOutcomeTransitionCondition(purchases.outcome, incomingOutcome),
      target: purchases.paymentIntentId,
    })
    .returning({ id: purchases.id });

  if (!savedPurchase) {
    const [preservedPurchase] = await transaction
      .select({ id: purchases.id })
      .from(purchases)
      .where(eq(purchases.paymentIntentId, paymentIntentId))
      .limit(1);

    if (!preservedPurchase) {
      throw new Error("payment_projection_purchase_disappeared");
    }

    return { paymentStateAccepted: false, purchaseId: preservedPurchase.id };
  }

  const purchaseId = savedPurchase.id;

  if (command.access) {
    await transaction
      .insert(accessEntitlements)
      .values({
        ...command.access,
        customerId,
        offerId: catalog.offerId,
        productId: catalog.productId,
        purchaseId,
        updatedAt: command.projectedAt,
      })
      .onConflictDoUpdate({
        set: {
          ...command.access,
          customerId,
          offerId: catalog.offerId,
          productId: catalog.productId,
          updatedAt: command.projectedAt,
        },
        target: [accessEntitlements.purchaseId, accessEntitlements.accessKey],
      });
  }

  if (command.invoice) {
    await transaction
      .insert(invoices)
      .values({
        ...command.invoice,
        purchaseId,
        updatedAt: command.projectedAt,
      })
      .onConflictDoUpdate({
        set: {
          amountMinor: command.invoice.amountMinor,
          buyerEmailSnapshot: command.invoice.buyerEmailSnapshot,
          buyerNameSnapshot: command.invoice.buyerNameSnapshot,
          currency: command.invoice.currency,
          issuedAt: command.invoice.issuedAt,
          sequenceMonth: command.invoice.sequenceMonth,
          sequenceNumber: command.invoice.sequenceNumber,
          sequenceYear: command.invoice.sequenceYear,
          updatedAt: command.projectedAt,
        },
        target: invoices.purchaseId,
      });
  }

  for (const job of command.outboxJobs) {
    await enqueueOutboxJobInTransaction(transaction, {
      ...job,
      purchaseId,
    });
  }

  return { paymentStateAccepted: true, purchaseId };
};
