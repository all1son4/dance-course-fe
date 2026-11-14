import type Stripe from "stripe";

import {
  isInspirationHubOfferId,
  isOnlineGroupNewOfferId,
  isOnlineGroupRenewalOfferId,
} from "@/constants/sellable-products";
import { getDatabaseErrorCode } from "@/db/database-read-retry";
import {
  ensureHubPurchaseAccessInDatabase,
  type PurchaseOwnerWrite,
  recordOnlineGroupPurchaseSourceInDatabase,
} from "@/db/purchase-access-source";
import type { PaymentRecordSnapshot } from "@/lib/payment-record";

import {
  getPurchaseSideEffectPaymentIntent,
  shouldRunPurchaseSuccessSideEffects,
} from "./eligibility";

export type PurchaseAccessPlan =
  | {
      kind: "online_group";
      cohortId: string;
      verifiedTelegramUserId: string | null;
    }
  | {
      kind: "inspiration_hub";
      continuationCohortId: string | null;
      verifiedTelegramUserId: string | null;
    }
  | { kind: "none" };

/** Purchases that get the "hub access" job: the Hub itself and every Online Group offer. */
export const needsPurchaseAccessJob = (offerId: string) =>
  isInspirationHubOfferId(offerId) ||
  isOnlineGroupNewOfferId(offerId) ||
  isOnlineGroupRenewalOfferId(offerId);

const readMetadata = (metadata: Stripe.Metadata, key: string) =>
  metadata[key]?.trim() || null;

/**
 * Reads what the payment route stored at checkout. An Online payment created before
 * cohorts existed carries no cohort and stays in the legacy model; the transfer
 * script links it by its main chat.
 */
export const getPurchaseAccessPlan = ({
  metadata,
  offerId,
}: {
  metadata: Stripe.Metadata;
  offerId: string;
}): PurchaseAccessPlan => {
  const verifiedTelegramUserId = readMetadata(metadata, "telegram_user_id");

  if (isInspirationHubOfferId(offerId)) {
    return {
      kind: "inspiration_hub",
      continuationCohortId:
        readMetadata(metadata, "hub_discount_basis") === "cohort_chat"
          ? readMetadata(metadata, "hub_discount_cohort_id")
          : null,
      verifiedTelegramUserId,
    };
  }

  const cohortId = readMetadata(metadata, "online_group_cohort_id");

  if (
    cohortId &&
    (isOnlineGroupNewOfferId(offerId) || isOnlineGroupRenewalOfferId(offerId))
  ) {
    return { kind: "online_group", cohortId, verifiedTelegramUserId };
  }

  return { kind: "none" };
};

class PurchaseAccessRejectedError extends Error {
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = "PurchaseAccessRejectedError";
  }
}

/**
 * Lock and serialization conflicts are retried by the outbox. Any other Hub or access
 * rule violation is final: the job is dead-lettered, the purchase stays, and the
 * purchase alert names the reason.
 */
export const isRejectedPurchaseAccessError = (error: unknown): error is Error =>
  error instanceof Error &&
  getDatabaseErrorCode(error) === null &&
  /^(hub|purchase_access)_/u.test(error.message) &&
  !/_(read|write)_conflict/u.test(error.message);

const reportOwnerProblem = ({
  ambiguousKnownOwner = false,
  ownerWrite,
  purchaseId,
}: {
  ambiguousKnownOwner?: boolean;
  ownerWrite: PurchaseOwnerWrite | null;
  purchaseId: string;
}) => {
  if (ownerWrite === "mismatch") {
    console.error("Purchase already names another Telegram account; owner kept", {
      purchaseId,
    });
  }
  if (ambiguousKnownOwner) {
    console.error("Customer sits in the Hub under several accounts; owner left empty", {
      purchaseId,
    });
  }
};

export const deliverPurchaseAccessFromOutbox = async ({
  event,
  paymentRecord,
  purchaseId,
  stripe,
}: {
  event: Stripe.Event;
  paymentRecord: PaymentRecordSnapshot;
  purchaseId: string | null;
  stripe: Stripe;
}): Promise<{ skipped?: boolean }> => {
  if (
    !shouldRunPurchaseSuccessSideEffects(event) ||
    paymentRecord.outcome !== "succeeded"
  ) {
    return { skipped: true };
  }
  if (!purchaseId)
    throw new PurchaseAccessRejectedError("purchase_access_purchase_invalid");

  const paymentIntent = await getPurchaseSideEffectPaymentIntent({ event, stripe });
  const plan = getPurchaseAccessPlan({
    metadata: paymentIntent?.metadata ?? {},
    offerId: paymentRecord.offer_id,
  });

  try {
    if (plan.kind === "online_group") {
      const ownerWrite = await recordOnlineGroupPurchaseSourceInDatabase({
        purchaseId,
        cohortId: plan.cohortId,
        verifiedTelegramUserId: plan.verifiedTelegramUserId,
      });
      reportOwnerProblem({ ownerWrite, purchaseId });
      return {};
    }

    if (plan.kind === "inspiration_hub") {
      const access = await ensureHubPurchaseAccessInDatabase({
        purchaseId,
        continuationCohortId: plan.continuationCohortId,
        processedAt: new Date(),
        verifiedTelegramUserId: plan.verifiedTelegramUserId,
      });
      reportOwnerProblem({ ...access, purchaseId });
      return {};
    }
  } catch (error) {
    if (isRejectedPurchaseAccessError(error)) {
      throw new PurchaseAccessRejectedError(error.message);
    }
    throw error;
  }

  return { skipped: true };
};
