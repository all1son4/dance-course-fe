import type { TestContext } from "node:test";

import type Stripe from "stripe";

export type RecordedFetchCall = {
  body: string;
  headers: Headers;
  method: string;
  url: string;
};

type FetchFixtureResponse = {
  body?: unknown;
  headers?: HeadersInit;
  status?: number;
};

export const installJsonFetchFixture = (
  context: TestContext,
  responses: FetchFixtureResponse[],
) => {
  const originalFetch = globalThis.fetch;
  const calls: RecordedFetchCall[] = [];

  globalThis.fetch = (async (input, init) => {
    const request = input instanceof Request ? input : null;
    const response = responses[calls.length];

    if (!response) {
      throw new Error(`unexpected_fetch_call:${String(input)}`);
    }

    calls.push({
      body: typeof init?.body === "string" ? init.body : "",
      headers: new Headers(init?.headers ?? request?.headers),
      method: init?.method ?? request?.method ?? "GET",
      url: request?.url ?? String(input),
    });

    return new Response(JSON.stringify(response.body ?? {}), {
      headers: {
        "Content-Type": "application/json",
        ...response.headers,
      },
      status: response.status ?? 200,
    });
  }) as typeof fetch;

  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  return calls;
};

export const createStripePaymentIntent = (
  overrides: Partial<Stripe.PaymentIntent> = {},
): Stripe.PaymentIntent => {
  const basePaymentIntent = {
    amount: 5_000,
    currency: "eur",
    id: "pi_fixture",
    last_payment_error: null,
    metadata: {
      checkout_session_id: "checkout_fixture",
    },
    object: "payment_intent",
    status: "succeeded",
  } as unknown as Stripe.PaymentIntent;

  return {
    ...basePaymentIntent,
    ...overrides,
    metadata: {
      ...basePaymentIntent.metadata,
      ...overrides.metadata,
    },
  };
};

export const createStripeEvent = ({
  object,
  type,
}: {
  object: object;
  type: Stripe.Event["type"];
}): Stripe.Event =>
  ({
    api_version: "2026-07-29.basil",
    created: 1_765_843_200,
    data: {
      object,
    },
    id: "evt_fixture",
    livemode: false,
    object: "event",
    pending_webhooks: 0,
    request: null,
    type,
  }) as Stripe.Event;

export const createStripeFake = (
  paymentIntents: Record<string, Stripe.PaymentIntent>,
) => {
  const retrieveCalls: string[] = [];
  const stripe = {
    paymentIntents: {
      retrieve: async (paymentIntentId: string) => {
        retrieveCalls.push(paymentIntentId);

        const paymentIntent = paymentIntents[paymentIntentId];

        if (!paymentIntent) {
          throw new Error(`missing_stripe_fixture:${paymentIntentId}`);
        }

        return paymentIntent;
      },
    },
  } as unknown as Stripe;

  return {
    retrieveCalls,
    stripe,
  };
};
