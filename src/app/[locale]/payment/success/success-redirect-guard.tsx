"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const STATUS_CHECK_MAX_ATTEMPTS = 4;
const STATUS_CHECK_RETRY_DELAY_MS = 1_000;
const STATUS_REQUEST_TIMEOUT_MS = 8_000;

type SuccessRedirectGuardProps = {
  checkoutSessionId: string;
  failedPath: string;
  paymentIntentId: string;
};

export default function SuccessRedirectGuard({
  checkoutSessionId,
  failedPath,
  paymentIntentId,
}: SuccessRedirectGuardProps) {
  const router = useRouter();

  useEffect(() => {
    document.body.setAttribute("data-hide-footer", "true");
    document.body.setAttribute("data-payment-result", "true");

    return () => {
      document.body.removeAttribute("data-hide-footer");
      document.body.removeAttribute("data-payment-result");
    };
  }, []);

  useEffect(() => {
    if (!paymentIntentId || !checkoutSessionId) {
      return;
    }

    let isDisposed = false;
    let activeAbortController: AbortController | null = null;
    const pendingTimeouts = new Set<number>();
    const wait = (delayMs: number) =>
      new Promise<void>((resolve) => {
        const timeoutId = window.setTimeout(() => {
          pendingTimeouts.delete(timeoutId);
          resolve();
        }, delayMs);
        pendingTimeouts.add(timeoutId);
      });

    const verifyOutcome = async () => {
      for (let attempt = 0; attempt < STATUS_CHECK_MAX_ATTEMPTS; attempt += 1) {
        const requestController = new AbortController();
        activeAbortController = requestController;
        const requestTimeoutId = window.setTimeout(() => {
          requestController.abort();
        }, STATUS_REQUEST_TIMEOUT_MS);
        pendingTimeouts.add(requestTimeoutId);

        try {
          const response = await fetch("/api/stripe/payment-intent/status", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              checkoutSessionId,
              paymentIntentId,
            }),
            signal: requestController.signal,
          });

          if (isDisposed) {
            return;
          }

          if (!response.ok) {
            if (response.status === 400 || response.status === 403) {
              router.replace(failedPath);
              return;
            }

            if (attempt === STATUS_CHECK_MAX_ATTEMPTS - 1) {
              return;
            }

            await wait(STATUS_CHECK_RETRY_DELAY_MS);
            continue;
          }

          const data = (await response.json()) as {
            outcome?:
              | "canceled"
              | "failed"
              | "processing"
              | "requires_action"
              | "succeeded";
          };

          if (data.outcome === "failed" || data.outcome === "canceled") {
            router.replace(failedPath);
          }
          return;
        } catch {
          if (isDisposed) {
            return;
          }

          if (attempt === STATUS_CHECK_MAX_ATTEMPTS - 1) {
            return;
          }

          await wait(STATUS_CHECK_RETRY_DELAY_MS);
        } finally {
          window.clearTimeout(requestTimeoutId);
          pendingTimeouts.delete(requestTimeoutId);
        }
      }
    };

    void verifyOutcome();

    return () => {
      isDisposed = true;
      activeAbortController?.abort();
      pendingTimeouts.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      pendingTimeouts.clear();
    };
  }, [checkoutSessionId, failedPath, paymentIntentId, router]);

  return null;
}
