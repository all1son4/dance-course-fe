import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type Stripe from "stripe";

import { getDatabase } from "./client";
import {
  accessEntitlements,
  purchases,
  purchaseSideEffects,
  stripeEvents,
} from "./schema";

const DEAD_LETTER_LIST_LIMIT = 20;
const PROBLEM_ENTITLEMENT_LIST_LIMIT = 50;

export const listStripeInboxDeadLetters = async () => {
  const rows = await getDatabase()
    .select({
      attemptCount: stripeEvents.attemptCount,
      deadLetteredAt: stripeEvents.deadLetteredAt,
      errorCode: stripeEvents.errorCode,
      errorMessage: stripeEvents.errorMessage,
      eventType: stripeEvents.eventType,
      paymentIntentId: stripeEvents.paymentIntentId,
      stripeEventId: stripeEvents.stripeEventId,
    })
    .from(stripeEvents)
    // Unverified legacy rows are excluded to match the operational-status
    // counters and the inbox claim loop: replaying them could never complete.
    .where(
      and(
        eq(stripeEvents.processingStatus, "dead_letter"),
        eq(stripeEvents.providerPayloadVerified, true),
      ),
    )
    .orderBy(desc(stripeEvents.deadLetteredAt))
    .limit(DEAD_LETTER_LIST_LIMIT);

  return rows.map((row) => ({
    attemptCount: row.attemptCount,
    deadLetteredAt: row.deadLetteredAt?.toISOString() ?? "",
    errorCode: row.errorCode ?? "",
    errorMessage: row.errorMessage ?? "",
    eventType: row.eventType,
    paymentIntentId: row.paymentIntentId ?? "",
    stripeEventId: row.stripeEventId,
  }));
};

export const listOutboxDeadLetters = async () => {
  const rows = await getDatabase()
    .select({
      attemptCount: purchaseSideEffects.attemptCount,
      deadLetteredAt: purchaseSideEffects.deadLetteredAt,
      deduplicationKey: purchaseSideEffects.deduplicationKey,
      kind: purchaseSideEffects.kind,
      lastErrorCode: purchaseSideEffects.lastErrorCode,
      lastErrorMessage: purchaseSideEffects.lastErrorMessage,
      recipient: purchaseSideEffects.recipient,
    })
    .from(purchaseSideEffects)
    .where(
      sql`${purchaseSideEffects.status} = 'dead_letter'
        AND ${purchaseSideEffects.payload} @> '{"_outboxVersion":1}'::jsonb`,
    )
    .orderBy(desc(purchaseSideEffects.deadLetteredAt))
    .limit(DEAD_LETTER_LIST_LIMIT);

  return rows.map((row) => ({
    attemptCount: row.attemptCount,
    deadLetteredAt: row.deadLetteredAt?.toISOString() ?? "",
    deduplicationKey: row.deduplicationKey,
    kind: row.kind,
    lastErrorCode: row.lastErrorCode ?? "",
    lastErrorMessage: row.lastErrorMessage ?? "",
    recipient: row.recipient ?? "",
  }));
};

export const findOutboxJobKindByDeduplicationKey = async (deduplicationKey: string) => {
  const [row] = await getDatabase()
    .select({ kind: purchaseSideEffects.kind })
    .from(purchaseSideEffects)
    .where(eq(purchaseSideEffects.deduplicationKey, deduplicationKey))
    .limit(1);

  return row?.kind ?? null;
};

export const findOutboxJobStatusByDeduplicationKey = async (deduplicationKey: string) => {
  const [row] = await getDatabase()
    .select({ status: purchaseSideEffects.status })
    .from(purchaseSideEffects)
    .where(eq(purchaseSideEffects.deduplicationKey, deduplicationKey))
    .limit(1);

  return row?.status ?? null;
};

export const findStripeInboxEventReplayState = async (stripeEventId: string) => {
  const [row] = await getDatabase()
    .select({
      processingStatus: stripeEvents.processingStatus,
      providerPayloadVerified: stripeEvents.providerPayloadVerified,
    })
    .from(stripeEvents)
    .where(eq(stripeEvents.stripeEventId, stripeEventId))
    .limit(1);

  return row ?? null;
};

export const findVerifiedSucceededStripeEvent = async (
  paymentIntentId: string,
): Promise<Stripe.Event | null> => {
  const [row] = await getDatabase()
    .select({
      eventType: stripeEvents.eventType,
      payload: stripeEvents.payload,
      stripeEventId: stripeEvents.stripeEventId,
    })
    .from(stripeEvents)
    .where(
      and(
        eq(stripeEvents.paymentIntentId, paymentIntentId),
        eq(stripeEvents.eventType, "payment_intent.succeeded"),
        eq(stripeEvents.providerPayloadVerified, true),
      ),
    )
    .orderBy(desc(stripeEvents.stripeCreatedAt))
    .limit(1);

  if (!row) {
    return null;
  }

  const event = row.payload as unknown as Stripe.Event;

  // The stored payload is evidence; a mismatch with the row's own identity
  // means it must not be used to email a customer.
  if (event.id !== row.stripeEventId || event.type !== row.eventType) {
    return null;
  }

  return event;
};

export const listProblemAccessEntitlements = async () => {
  const rows = await getDatabase()
    .select({
      customerEmail: purchases.customerEmailSnapshot,
      customerFullName: purchases.customerFullNameSnapshot,
      entitlementId: accessEntitlements.id,
      paymentIntentId: purchases.paymentIntentId,
      productTitle: purchases.purchaseItemSnapshot,
      productTitleFallback: purchases.productTitleSnapshot,
      status: accessEntitlements.status,
      updatedAt: accessEntitlements.updatedAt,
    })
    .from(accessEntitlements)
    .innerJoin(purchases, eq(accessEntitlements.purchaseId, purchases.id))
    .where(inArray(accessEntitlements.status, ["link_failed", "manual_pending"]))
    .orderBy(desc(accessEntitlements.updatedAt))
    .limit(PROBLEM_ENTITLEMENT_LIST_LIMIT);

  return rows.map((row) => ({
    customerEmail: row.customerEmail ?? "",
    customerName: row.customerFullName ?? "",
    entitlementId: row.entitlementId,
    paymentIntentId: row.paymentIntentId,
    productTitle: row.productTitle ?? row.productTitleFallback ?? "",
    status: row.status as "link_failed" | "manual_pending",
    updatedAt: row.updatedAt.toISOString(),
  }));
};
