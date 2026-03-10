"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

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

    const verifyOutcome = async () => {
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
          }
          return;
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
      } catch {
        // Keep the success screen if status validation is temporarily unavailable.
      }
    };

    void verifyOutcome();

    return () => {
      isDisposed = true;
    };
  }, [checkoutSessionId, failedPath, paymentIntentId, router]);

  return null;
}
