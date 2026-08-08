"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

import type { ManagedPaymentIntentOutcome } from "@/app/api/stripe/payment-intent/lib";

import { ResultParagraph } from "../result-page.styles";
import { resolveSuccessPageOutcomeAction } from "./success-outcome";

const STATUS_CHECK_MAX_ATTEMPTS = 4;
const STATUS_CHECK_RETRY_DELAY_MS = 1_000;
const STATUS_REQUEST_TIMEOUT_MS = 8_000;

type SuccessRedirectGuardProps = {
  children: ReactNode;
  checkingText: string;
  checkoutSessionId: string;
  failedPath: string;
  paymentIntentId: string;
  paymentPath: string;
  pendingText: string;
  unavailableText: string;
};

type VerificationState = "checking" | "pending" | "succeeded" | "unavailable";

export default function SuccessRedirectGuard({
  children,
  checkingText,
  checkoutSessionId,
  failedPath,
  paymentIntentId,
  paymentPath,
  pendingText,
  unavailableText,
}: SuccessRedirectGuardProps) {
  const router = useRouter();
  const [verificationState, setVerificationState] =
    useState<VerificationState>("checking");

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
              router.replace(paymentPath);
              return;
            }

            if (attempt === STATUS_CHECK_MAX_ATTEMPTS - 1) {
              setVerificationState("unavailable");
              return;
            }

            await wait(STATUS_CHECK_RETRY_DELAY_MS);
            continue;
          }

          const data = (await response.json()) as {
            outcome?: ManagedPaymentIntentOutcome;
          };
          const action = resolveSuccessPageOutcomeAction(data.outcome);

          if (action === "show_success") {
            setVerificationState("succeeded");
            return;
          }

          if (action === "redirect_failed") {
            router.replace(failedPath);
            return;
          }

          if (action === "show_pending") {
            if (attempt === STATUS_CHECK_MAX_ATTEMPTS - 1) {
              setVerificationState("pending");
              return;
            }

            await wait(STATUS_CHECK_RETRY_DELAY_MS);
            continue;
          }

          setVerificationState("unavailable");
          return;
        } catch {
          if (isDisposed) {
            return;
          }

          if (attempt === STATUS_CHECK_MAX_ATTEMPTS - 1) {
            setVerificationState("unavailable");
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
  }, [checkoutSessionId, failedPath, paymentIntentId, paymentPath, router]);

  if (verificationState === "succeeded") {
    return <>{children}</>;
  }

  return (
    <ResultParagraph
      role={verificationState === "unavailable" ? "alert" : "status"}
      aria-atomic="true"
      aria-live={verificationState === "unavailable" ? "assertive" : "polite"}
    >
      {verificationState === "checking"
        ? checkingText
        : verificationState === "pending"
          ? pendingText
          : unavailableText}
    </ResultParagraph>
  );
}
