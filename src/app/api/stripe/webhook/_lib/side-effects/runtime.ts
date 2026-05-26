import type Stripe from "stripe";

const vercelEnvironment = process.env.VERCEL_ENV;
const isProductionDeployment =
  vercelEnvironment === "production" ||
  (!vercelEnvironment && process.env.NODE_ENV === "production");
const allowTestModeNotifications = process.env.ALLOW_TEST_MODE_NOTIFICATIONS === "1";

export const shouldSendPurchaseSideEffectForEnvironment = (event: Stripe.Event) =>
  isProductionDeployment || allowTestModeNotifications || event.livemode;
