import type { PaymentRecordSnapshot } from "@/lib/payment-record";
import { toUtcIso } from "@/lib/time";

import {
  getTelegramChannelAccessDurationMs,
  isChoreoChannelOfferId,
  isFirstTouchOfferId,
  isLifetimeChannelOfferId,
} from "./offer-access";

export const parseTimestamp = (value: string) => {
  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) ? timestamp : 0;
};

const getPaymentAccessWindowStartedAtTs = (paymentRecord: PaymentRecordSnapshot) => {
  return parseTimestamp(paymentRecord.telegram_token_used_at);
};

const getComputedAccessExpiresAtIso = (paymentRecord: PaymentRecordSnapshot) => {
  const accessStartedAtTs = getPaymentAccessWindowStartedAtTs(paymentRecord);
  const accessDurationMs = getTelegramChannelAccessDurationMs(paymentRecord.offer_id);

  if (accessStartedAtTs <= 0 || accessDurationMs <= 0) {
    return "";
  }

  return toUtcIso(new Date(accessStartedAtTs + accessDurationMs));
};

export const getPaymentAccessExpiresAtIso = (paymentRecord: PaymentRecordSnapshot) =>
  paymentRecord.telegram_access_expires_at.trim() ||
  getComputedAccessExpiresAtIso(paymentRecord);

export const isIsoExpired = (value: string) => parseTimestamp(value) <= Date.now();

/**
 * Who gets an invite link at all. Deliberately wider than the timed set below:
 * lifetime offers are handed a link and never given an expiry.
 */
export const isOfferEligibleForTelegramAccessLink = (offerId: string) =>
  isChoreoChannelOfferId(offerId) ||
  isFirstTouchOfferId(offerId) ||
  isLifetimeChannelOfferId(offerId);

/** A purchase that gets the ordinary Telegram link: an eligible offer not handed out by hand. */
export const isStandardTelegramLinkPayment = (paymentRecord: PaymentRecordSnapshot) =>
  paymentRecord.access_workflow.trim() !== "manual-admin" &&
  isOfferEligibleForTelegramAccessLink(paymentRecord.offer_id);

/**
 * Who gets an access window that can run out. Lifetime offers must stay out of
 * this list - it is what the revocation sweep keys off.
 */
export const isTimedAccessOfferId = (offerId: string) =>
  isChoreoChannelOfferId(offerId) || isFirstTouchOfferId(offerId);

export const isPaymentTimedTelegramAccess = (paymentRecord: PaymentRecordSnapshot) =>
  isTimedAccessOfferId(paymentRecord.offer_id);
