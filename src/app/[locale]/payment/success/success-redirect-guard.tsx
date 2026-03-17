"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const STATUS_CHECK_MAX_ATTEMPTS = 4;
const STATUS_CHECK_RETRY_DELAY_MS = 1_000;

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

    return () => {
      document.body.removeAttribute("data-hide-footer");
    };
  }, []);

  useEffect(() => {
    if (!paymentIntentId || !checkoutSessionId) {
      return;
    }

    let isDisposed = false;
    const wait = (delayMs: number) =>
      new Promise<void>((resolve) => {
        window.setTimeout(() => resolve(), delayMs);
      });

    const verifyOutcome = async () => {
      for (let attempt = 0; attempt < STATUS_CHECK_MAX_ATTEMPTS; attempt += 1) {
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
        }
      }
    };

    void verifyOutcome();

    return () => {
      isDisposed = true;
    };
  }, [checkoutSessionId, failedPath, paymentIntentId, router]);

  return null;
}
