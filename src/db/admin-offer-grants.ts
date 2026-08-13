import { and, eq, sql } from "drizzle-orm";

import { getDatabase } from "./client";
import { findPaymentRecordByIntentIdFromDatabase } from "./payment-records";
import { accessEntitlements, productOffers, products, purchases } from "./schema";
import { enqueueOutboxJobInTransaction } from "./transactional-outbox";

export type CreateAdminOfferGrantCommand = {
  accessWorkflow: string;
  adminLabel: string;
  checkoutSessionId: string;
  createdAt: Date;
  enqueueSuccessfulCustomerExport: boolean;
  eventId: string;
  inspirationChatId?: string | null;
  lessonLanguage: "en" | "ru";
  mainChatId?: string | null;
  offerExternalId: string;
  offerLabel: string;
  paymentIntentId: string;
  productExternalId: string;
  productTitle: string;
  purchaseItem: string;
};

const requireNonEmpty = (value: string, field: string) => {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error(`admin_offer_grant_${field}_required`);
  }

  return normalizedValue;
};

const normalizeOptional = (value: string | null | undefined) => value?.trim() || null;

const assertIdempotentGrant = ({
  command,
  existing,
}: {
  command: CreateAdminOfferGrantCommand;
  existing: {
    checkoutSessionId: string | null;
    offerExternalId: string | null;
    productExternalId: string | null;
    source: string;
  };
}) => {
  if (
    existing.source !== "admin_offer_link" ||
    existing.checkoutSessionId !== command.checkoutSessionId.trim() ||
    existing.offerExternalId !== command.offerExternalId.trim() ||
    existing.productExternalId !== command.productExternalId.trim()
  ) {
    throw new Error("admin_offer_grant_idempotency_conflict");
  }
};

export const createAdminOfferGrantInDatabase = async (
  command: CreateAdminOfferGrantCommand,
) => {
  const paymentIntentId = requireNonEmpty(command.paymentIntentId, "payment_intent_id");
  const checkoutSessionId = requireNonEmpty(
    command.checkoutSessionId,
    "checkout_session_id",
  );
  const eventId = requireNonEmpty(command.eventId, "event_id");
  const productExternalId = requireNonEmpty(command.productExternalId, "product_id");
  const offerExternalId = requireNonEmpty(command.offerExternalId, "offer_id");
  const accessWorkflow = requireNonEmpty(command.accessWorkflow, "access_workflow");
  const productTitle = requireNonEmpty(command.productTitle, "product_title");
  const offerLabel = requireNonEmpty(command.offerLabel, "offer_label");
  const createdAt = new Date(command.createdAt);

  if (
    !paymentIntentId.startsWith("adm_offer_pi_") ||
    !checkoutSessionId.startsWith("adm_offer_cs_") ||
    !eventId.startsWith("adm_offer_evt_")
  ) {
    throw new Error("admin_offer_grant_synthetic_id_invalid");
  }

  if (
    accessWorkflow !== "admin-offer-link" &&
    accessWorkflow !== "telegram-online-group"
  ) {
    throw new Error("admin_offer_grant_access_workflow_invalid");
  }

  if (command.lessonLanguage !== "en" && command.lessonLanguage !== "ru") {
    throw new Error("admin_offer_grant_lesson_language_invalid");
  }

  if (!Number.isFinite(createdAt.getTime())) {
    throw new Error("admin_offer_grant_created_at_invalid");
  }

  await getDatabase().transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(
        hashtextextended(${`admin-offer-grant:${paymentIntentId}`}, 0)
      )`,
    );

    const [existingPurchase] = await transaction
      .select({
        checkoutSessionId: purchases.checkoutSessionId,
        id: purchases.id,
        offerExternalId: purchases.offerExternalId,
        offerId: purchases.offerId,
        productExternalId: purchases.productExternalId,
        productId: purchases.productId,
        source: purchases.source,
      })
      .from(purchases)
      .where(eq(purchases.paymentIntentId, paymentIntentId))
      .limit(1);
    let purchaseId = existingPurchase?.id;
    let catalogSelection: { offerId: string; productId: string };

    if (existingPurchase) {
      assertIdempotentGrant({ command, existing: existingPurchase });

      if (!existingPurchase.offerId || !existingPurchase.productId) {
        throw new Error("admin_offer_grant_catalog_reference_missing");
      }

      catalogSelection = {
        offerId: existingPurchase.offerId,
        productId: existingPurchase.productId,
      };
    } else {
      const [activeCatalogSelection] = await transaction
        .select({
          offerId: productOffers.id,
          productId: products.id,
        })
        .from(productOffers)
        .innerJoin(products, eq(productOffers.productId, products.id))
        .where(
          and(
            eq(productOffers.externalOfferId, offerExternalId),
            eq(productOffers.isActive, true),
            eq(products.externalProductId, productExternalId),
            eq(products.isActive, true),
          ),
        )
        .limit(1);

      if (!activeCatalogSelection) {
        throw new Error("admin_offer_grant_catalog_selection_not_found");
      }

      catalogSelection = activeCatalogSelection;
      const [createdPurchase] = await transaction
        .insert(purchases)
        .values({
          amountMinor: 0,
          checkoutCurrency: "pln",
          checkoutLocale: "ru",
          checkoutSessionId,
          currency: "pln",
          customerTelegramUsernameSnapshot: normalizeOptional(command.adminLabel),
          firstSeenAt: createdAt,
          inspirationChatIdSnapshot: normalizeOptional(command.inspirationChatId),
          latestEventId: eventId,
          latestEventType:
            accessWorkflow === "telegram-online-group"
              ? "admin.online_group_link.generated"
              : "admin.offer_link.generated",
          lessonLanguage: command.lessonLanguage,
          offerExternalId,
          offerId: catalogSelection.offerId,
          offerLabelSnapshot: offerLabel,
          outcome: "succeeded",
          paymentIntentId,
          productExternalId,
          productId: catalogSelection.productId,
          productTitleSnapshot: productTitle,
          purchaseItemSnapshot: normalizeOptional(command.purchaseItem),
          source: "admin_offer_link",
          stripeStatus: "succeeded",
          updatedAt: createdAt,
        })
        .returning({ id: purchases.id });

      if (!createdPurchase) {
        throw new Error("admin_offer_grant_purchase_not_created");
      }

      purchaseId = createdPurchase.id;
    }

    if (!purchaseId) {
      throw new Error("admin_offer_grant_purchase_missing");
    }

    await transaction
      .insert(accessEntitlements)
      .values({
        accessKey: "primary",
        accessWorkflow,
        deliveryChannel: "telegram",
        externalTargetType: "telegram_chat",
        offerId: catalogSelection.offerId,
        productId: catalogSelection.productId,
        purchaseId,
        status: "pending",
        telegramChatId: normalizeOptional(command.mainChatId),
        updatedAt: createdAt,
      })
      .onConflictDoNothing({
        target: [accessEntitlements.purchaseId, accessEntitlements.accessKey],
      });

    if (command.enqueueSuccessfulCustomerExport) {
      await enqueueOutboxJobInTransaction(transaction, {
        deduplicationKey: `purchase:${purchaseId}:successful_customer_export`,
        kind: "successful_customer_export",
        payload: {
          paymentIntentId,
          source: "admin_offer_link",
        },
        provider: "google_sheets",
        purchaseId,
      });
    }
  });

  const paymentRecord = await findPaymentRecordByIntentIdFromDatabase(paymentIntentId);

  if (!paymentRecord) {
    throw new Error("admin_offer_grant_projection_not_found");
  }

  return paymentRecord;
};
