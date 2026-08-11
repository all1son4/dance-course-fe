import type Stripe from "stripe";

import { projectPaymentStateInTransaction } from "@/db/payment-projection";
import { processNextStripeInboxEvent } from "@/db/stripe-event-inbox";

import {
  applyPreparedStripeChargeSettlement,
  createStripePaymentProjectionCommand,
  getPurchaseSettlementSnapshot,
  type PreparedStripeChargeSettlement,
  prepareStripeChargeSettlement,
  type StripeSettlementSnapshot,
} from "./database-sync";
import { shouldRunPurchaseSuccessSideEffects } from "./side-effects/eligibility";
import {
  isSupportedStripePaymentIntentEvent,
  prepareStripePaymentEventForDatabase,
  shouldIgnoreStripeCheckoutSessionEvent,
  type StripePaymentWebhookResult,
} from "./sync";

const STRIPE_CHARGE_SETTLEMENT_EVENT_TYPES = new Set([
  "charge.succeeded",
  "charge.updated",
]);

type PreparedInboxEvent =
  | {
      kind: "charge";
      settlement: PreparedStripeChargeSettlement;
    }
  | {
      event: Stripe.Event;
      handledEvent: StripePaymentWebhookResult;
      kind: "payment";
      settlement: StripeSettlementSnapshot | null;
    }
  | {
      kind: "skipped";
    };

const toStripeEvent = (payload: Record<string, unknown>): Stripe.Event =>
  payload as unknown as Stripe.Event;

const createPurchaseOutboxJobs = ({
  event,
  handledEvent,
}: {
  event: Stripe.Event;
  handledEvent: StripePaymentWebhookResult;
}) => {
  const paymentRecord = handledEvent.paymentRecord;
  const paymentIntentId = paymentRecord.payment_intent_id.trim();

  if (
    handledEvent.skipped ||
    paymentRecord.outcome !== "succeeded" ||
    !shouldRunPurchaseSuccessSideEffects(event)
  ) {
    return [];
  }

  const sharedPayload = {
    eventType: event.type,
    paymentIntentId,
    stripeEventId: event.id,
  };

  return [
    {
      kind: "purchase_success_email" as const,
      payload: {
        ...sharedPayload,
        providerIdempotencyKey: `purchase-success/${paymentIntentId}`,
      },
      provider: "resend" as const,
      recipient: paymentRecord.customer_email.trim() || null,
    },
    {
      kind: "admin_telegram_alert" as const,
      payload: sharedPayload,
      provider: "telegram" as const,
    },
    {
      kind: "successful_customer_export" as const,
      payload: sharedPayload,
      provider: "google_sheets" as const,
    },
  ];
};

const prepareInboxEvent = async ({
  event,
  stripe,
}: {
  event: Stripe.Event;
  stripe: Stripe;
}): Promise<PreparedInboxEvent> => {
  if (STRIPE_CHARGE_SETTLEMENT_EVENT_TYPES.has(event.type)) {
    return {
      kind: "charge",
      settlement: await prepareStripeChargeSettlement({ event, stripe }),
    };
  }

  if (
    !isSupportedStripePaymentIntentEvent(event.type) ||
    shouldIgnoreStripeCheckoutSessionEvent(event)
  ) {
    return { kind: "skipped" };
  }

  const handledEvent = await prepareStripePaymentEventForDatabase(event);
  const paymentIntentId = handledEvent.paymentRecord.payment_intent_id.trim();

  if (!paymentIntentId) {
    throw new Error("stripe_inbox_payment_intent_id_missing");
  }

  const settlement = handledEvent.skipped
    ? null
    : await getPurchaseSettlementSnapshot({
        paymentIntentId,
        paymentRecord: handledEvent.paymentRecord,
        stripe,
      });

  return {
    event,
    handledEvent,
    kind: "payment",
    settlement,
  };
};

export const processNextStripeWebhookInboxJob = ({
  eventTypes,
  stripe,
}: {
  eventTypes?: string[];
  stripe: Stripe;
}) =>
  processNextStripeInboxEvent<PreparedInboxEvent>({
    eventTypes,
    prepare: (claimedEvent) =>
      prepareInboxEvent({
        event: toStripeEvent(claimedEvent.payload),
        stripe,
      }),
    project: async ({ prepared, transaction }) => {
      if (prepared.kind === "skipped") {
        return { skipped: true };
      }

      if (prepared.kind === "charge") {
        const settlement = await applyPreparedStripeChargeSettlement({
          prepared: prepared.settlement,
          transaction,
        });

        if (
          settlement.status === "pending_balance_transaction" ||
          settlement.status === "purchase_not_found"
        ) {
          throw new Error(`stripe_charge_${settlement.status}`);
        }

        return {
          paymentIntentId: settlement.paymentIntentId || null,
          purchaseId: settlement.purchaseId,
          skipped: settlement.status === "skipped",
        };
      }

      if (prepared.handledEvent.skipped) {
        return {
          outcomeSnapshot: prepared.handledEvent.paymentRecord.outcome,
          paymentIntentId: prepared.handledEvent.paymentRecord.payment_intent_id || null,
          paymentStatusSnapshot: prepared.handledEvent.paymentRecord.status,
          skipped: true,
        };
      }

      if (!prepared.settlement) {
        throw new Error("stripe_inbox_settlement_missing");
      }

      const paymentRecord = prepared.handledEvent.paymentRecord;
      const command = createStripePaymentProjectionCommand({
        event: prepared.event,
        now: new Date(),
        outboxJobs: createPurchaseOutboxJobs({
          event: prepared.event,
          handledEvent: prepared.handledEvent,
        }),
        paymentIntentId: paymentRecord.payment_intent_id,
        paymentRecord,
        settlementSnapshot: prepared.settlement,
      });
      const projection = await projectPaymentStateInTransaction({
        command,
        transaction,
      });

      return {
        outcomeSnapshot: paymentRecord.outcome,
        paymentIntentId: paymentRecord.payment_intent_id,
        paymentStatusSnapshot: paymentRecord.status,
        purchaseId: projection.purchaseId,
      };
    },
  });
