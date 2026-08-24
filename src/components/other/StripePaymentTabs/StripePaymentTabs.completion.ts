import type { PaymentIntent } from "@stripe/stripe-js";

import { PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY } from "@/lib/payment-draft";

import type { StripePaymentFormProps } from "./StripePaymentTabs.helpers";
import type { StripePaymentTabsProps } from "./StripePaymentTabs.types";

const PAYMENT_API_ENDPOINTS = {
  cancelIntent: "/api/stripe/payment-intent/cancel",
  getIntentStatus: "/api/stripe/payment-intent/status",
} as const;
export const PAYMENT_RESULT_PATHS = {
  failed: "/payment/failed",
  success: "/payment/success",
} as const;
const PAYMENT_STATUS_REQUEST_ERROR = "payment_intent_status_failed";
const PAYMENT_STATUS_REQUEST_TIMEOUT_MS = 8_000;
const PAYMENT_STATUS_MAX_ATTEMPTS = 3;
const PAYMENT_STATUS_RETRY_BASE_DELAY_MS = 320;
const PAYMENT_STATUS_RETRY_MAX_DELAY_MS = 1_400;
const PAYMENT_STATUS_RETRY_JITTER_MS = 140;
const MILLISECONDS_PER_SECOND = 1_000;

type PaymentIntentStatusResponse = {
  outcome: "canceled" | "failed" | "processing" | "requires_action" | "succeeded";
  paymentIntentId: string;
  status: string;
};

export type ResultPageContext = Pick<
  StripePaymentTabsProps,
  "checkoutSessionId" | "resultCurrency" | "resultOfferId" | "resultProductId"
>;

export type PaymentCompletion =
  | {
      kind: "confirmed";
    }
  | {
      cancelUnusedIntents: boolean;
      kind: "redirect";
      pathname: string;
      paymentIntentId?: string;
    };

const wait = (delayMs: number): Promise<void> =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, delayMs);
  });

const hasRemainingStatusAttempt = (attempt: number): boolean =>
  attempt < PAYMENT_STATUS_MAX_ATTEMPTS - 1;

const getPaymentStatusRetryDelayMs = ({
  attempt,
  retryAfterSeconds,
}: {
  attempt: number;
  retryAfterSeconds?: number;
}): number => {
  if (Number.isFinite(retryAfterSeconds) && (retryAfterSeconds ?? 0) > 0) {
    return Math.ceil((retryAfterSeconds ?? 0) * MILLISECONDS_PER_SECOND);
  }

  const exponentialDelay = Math.min(
    PAYMENT_STATUS_RETRY_BASE_DELAY_MS * 2 ** attempt,
    PAYMENT_STATUS_RETRY_MAX_DELAY_MS,
  );
  const jitter = Math.floor(Math.random() * PAYMENT_STATUS_RETRY_JITTER_MS);

  return exponentialDelay + jitter;
};

const shouldRetryPaymentStatusRequest = (status: number): boolean =>
  status === 429 || status >= 500;

const getRetryAfterSeconds = (response: Response): number | undefined => {
  const retryAfterHeader = Number(response.headers.get("retry-after") ?? "");

  return Number.isFinite(retryAfterHeader) ? retryAfterHeader : undefined;
};

const isRetryablePaymentStatusError = (error: unknown): boolean =>
  (error instanceof Error && error.name === "AbortError") || error instanceof TypeError;

const getConfirmedStatus = async (
  paymentIntentId: string,
  checkoutSessionId: string,
): Promise<PaymentIntentStatusResponse> => {
  for (let attempt = 0; attempt < PAYMENT_STATUS_MAX_ATTEMPTS; attempt += 1) {
    const requestController = new AbortController();
    const timeoutId = window.setTimeout(() => {
      requestController.abort();
    }, PAYMENT_STATUS_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(PAYMENT_API_ENDPOINTS.getIntentStatus, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          checkoutSessionId,
          paymentIntentId,
        }),
        cache: "no-store",
        signal: requestController.signal,
      });

      if (response.ok) {
        return (await response.json()) as PaymentIntentStatusResponse;
      }

      if (
        hasRemainingStatusAttempt(attempt) &&
        shouldRetryPaymentStatusRequest(response.status)
      ) {
        await wait(
          getPaymentStatusRetryDelayMs({
            attempt,
            retryAfterSeconds: getRetryAfterSeconds(response),
          }),
        );
        continue;
      }

      throw new Error(PAYMENT_STATUS_REQUEST_ERROR);
    } catch (error) {
      if (hasRemainingStatusAttempt(attempt) && isRetryablePaymentStatusError(error)) {
        await wait(
          getPaymentStatusRetryDelayMs({
            attempt,
          }),
        );
        continue;
      }

      throw new Error(PAYMENT_STATUS_REQUEST_ERROR);
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  throw new Error(PAYMENT_STATUS_REQUEST_ERROR);
};

const setResultSearchParam = (url: URL, name: string, value?: string | null): void => {
  if (value) {
    url.searchParams.set(name, value);
  }
};

export const createResultPageUrl = (
  pathname: string,
  {
    checkoutSessionId,
    resultCurrency,
    resultOfferId,
    resultProductId,
  }: ResultPageContext,
  nextPaymentIntentId?: string,
): string => {
  const url = new URL(pathname, window.location.origin);

  // Keep the parameter order stable because it is visible in browser history.
  setResultSearchParam(url, "product", resultProductId);
  setResultSearchParam(url, "offer", resultOfferId);
  setResultSearchParam(url, "currency", resultCurrency);
  setResultSearchParam(url, "checkout", checkoutSessionId);
  setResultSearchParam(url, "payment_intent", nextPaymentIntentId);

  return url.toString();
};

export const redirectToResultPage = (
  pathname: string,
  resultPageContext: ResultPageContext,
  nextPaymentIntentId?: string,
): void => {
  if (typeof window === "undefined") {
    return;
  }

  // The draft outlives a failed attempt so "back to payment" restores the
  // filled form; only a completed purchase discards it.
  if (pathname === PAYMENT_RESULT_PATHS.success) {
    try {
      sessionStorage.removeItem(PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY);
    } catch {
      // Payment completion must not be blocked by strict browser storage policies.
    }
  }

  window.location.assign(
    createResultPageUrl(pathname, resultPageContext, nextPaymentIntentId),
  );
};

export const cancelUnusedPaymentIntents = ({
  allPaymentIntentIds,
  checkoutSessionId,
  usedPaymentIntentId,
}: Pick<StripePaymentFormProps, "allPaymentIntentIds" | "checkoutSessionId"> & {
  usedPaymentIntentId: string;
}): void => {
  if (!checkoutSessionId) {
    return;
  }

  const unusedPaymentIntentIds = [
    ...new Set((allPaymentIntentIds ?? []).map((id) => id.trim()).filter(Boolean)),
  ].filter((id) => id !== usedPaymentIntentId);

  // Cancellation is intentionally fire-and-forget so it cannot delay navigation.
  unusedPaymentIntentIds.forEach((paymentIntentId) => {
    void fetch(PAYMENT_API_ENDPOINTS.cancelIntent, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        checkoutSessionId,
        paymentIntentId,
      }),
      keepalive: true,
    }).catch(() => undefined);
  });
};

const resolveServerPaymentCompletion = (
  outcome: PaymentIntentStatusResponse["outcome"],
  paymentIntentId: string,
): PaymentCompletion => {
  if (outcome === "succeeded") {
    return {
      cancelUnusedIntents: true,
      kind: "redirect",
      pathname: PAYMENT_RESULT_PATHS.success,
      paymentIntentId,
    };
  }

  if (outcome === "failed" || outcome === "canceled") {
    return {
      cancelUnusedIntents: false,
      kind: "redirect",
      pathname: PAYMENT_RESULT_PATHS.failed,
      paymentIntentId,
    };
  }

  return { kind: "confirmed" };
};

export const resolvePaymentCompletion = async ({
  checkoutSessionId,
  fallbackPaymentIntentId,
  paymentIntent,
}: {
  checkoutSessionId?: string | null;
  fallbackPaymentIntentId?: string | null;
  paymentIntent?: PaymentIntent;
}): Promise<PaymentCompletion> => {
  const resolvedPaymentIntentId = paymentIntent?.id ?? fallbackPaymentIntentId ?? "";

  if (resolvedPaymentIntentId && checkoutSessionId) {
    const { outcome } = await getConfirmedStatus(
      resolvedPaymentIntentId,
      checkoutSessionId,
    );

    return resolveServerPaymentCompletion(outcome, resolvedPaymentIntentId);
  }

  if (paymentIntent?.status === "succeeded") {
    const usedPaymentIntentId = paymentIntent.id ?? resolvedPaymentIntentId;

    return {
      cancelUnusedIntents: Boolean(usedPaymentIntentId),
      kind: "redirect",
      pathname: PAYMENT_RESULT_PATHS.success,
      paymentIntentId: usedPaymentIntentId || undefined,
    };
  }

  return { kind: "confirmed" };
};
