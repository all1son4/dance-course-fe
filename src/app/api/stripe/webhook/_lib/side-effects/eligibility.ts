import type Stripe from "stripe";

const PURCHASE_SUCCESS_SIDE_EFFECT_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "payment_intent.succeeded",
]);

const getCheckoutSessionPaymentIntentId = (event: Stripe.Event) => {
  if (event.type !== "checkout.session.completed") {
    return "";
  }

  const checkoutSession = event.data.object as Stripe.Checkout.Session;
  const paymentIntent = checkoutSession.payment_intent;

  if (typeof paymentIntent === "string") {
    return paymentIntent;
  }

  return paymentIntent?.id ?? "";
};

export const shouldRunPurchaseSuccessSideEffects = (event: Stripe.Event) => {
  if (!PURCHASE_SUCCESS_SIDE_EFFECT_EVENT_TYPES.has(event.type)) {
    return false;
  }

  if (event.type === "payment_intent.succeeded") {
    return true;
  }

  // Payment Links emit checkout.session.completed and payment_intent.succeeded
  // for the same payment. Sheets still uses both events; email/Telegram should
  // run once, on the PaymentIntent event that represents the final payment state.
  return !getCheckoutSessionPaymentIntentId(event);
};

export const getPurchaseSideEffectPaymentIntent = async ({
  event,
  stripe,
}: {
  event: Stripe.Event;
  stripe: Stripe;
}) => {
  if (!shouldRunPurchaseSuccessSideEffects(event)) {
    return null;
  }

  if (event.type === "payment_intent.succeeded") {
    return event.data.object as Stripe.PaymentIntent;
  }

  const checkoutSession = event.data.object as Stripe.Checkout.Session;
  const paymentIntent = checkoutSession.payment_intent;

  if (!paymentIntent) {
    return null;
  }

  if (typeof paymentIntent !== "string") {
    return paymentIntent;
  }

  return stripe.paymentIntents.retrieve(paymentIntent);
};
