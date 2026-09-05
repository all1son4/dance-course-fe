"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

import type { ManagedPaymentIntentOutcome } from "@/app/api/stripe/payment-intent/lib";
import Button from "@/components/common/Button";
import { SUPPORT_TELEGRAM_URL } from "@/constants/links";
import { prefersReducedMotion } from "@/lib/reveal";

import {
  ResultActions,
  StatusCard,
  StatusMark,
  StatusSpinner,
  StatusText,
} from "../result-page.styles";
import { resolveSuccessPageOutcomeAction } from "./success-outcome";

const STATUS_CHECK_MAX_ATTEMPTS = 4;
const STATUS_CHECK_RETRY_DELAY_MS = 1_000;
const STATUS_REQUEST_TIMEOUT_MS = 8_000;
/** A check that runs this long gets a reassurance instead of the same spinner. */
const STATUS_REASSURANCE_DELAY_MS = 5_000;
/** And this long: the buyer also gets something to press, rather than waiting. */
const STATUS_ACTIONS_DELAY_MS = 12_000;
/** How long the status card fades before the confirmed content takes its place. */
const STATUS_LEAVE_MS = 160;

type SuccessRedirectGuardProps = {
  children: ReactNode;
  checkingText: string;
  checkoutSessionId: string;
  failedPath: string;
  homeButtonText: string;
  paymentIntentId: string;
  pendingText: string;
  preparingText: string;
  refreshButtonText: string;
  supportButtonText: string;
  unavailableText: string;
};

type VerificationState = "checking" | "pending" | "succeeded" | "unavailable";

export default function SuccessRedirectGuard({
  children,
  checkingText,
  checkoutSessionId,
  failedPath,
  homeButtonText,
  paymentIntentId,
  pendingText,
  preparingText,
  refreshButtonText,
  supportButtonText,
  unavailableText,
}: SuccessRedirectGuardProps) {
  const router = useRouter();
  const [verificationState, setVerificationState] =
    useState<VerificationState>("checking");
  const [isCheckingLong, setIsCheckingLong] = useState(false);
  const [isCheckingSlow, setIsCheckingSlow] = useState(false);
  const [isStatusLeaving, setIsStatusLeaving] = useState(false);

  // The checks can take a while (four attempts, each with its own timeout).
  // After a few seconds the spinner line changes from "checking" to a note
  // that the payment is being prepared, so a longer wait does not read as a
  // hang.
  useEffect(() => {
    if (verificationState !== "checking") {
      return;
    }

    const reassuranceId = window.setTimeout(() => {
      setIsCheckingLong(true);
    }, STATUS_REASSURANCE_DELAY_MS);
    // Past this point the wait is long enough that the buyer should have
    // something to press rather than only a spinner to watch.
    const actionsId = window.setTimeout(() => {
      setIsCheckingSlow(true);
    }, STATUS_ACTIONS_DELAY_MS);

    return () => {
      window.clearTimeout(reassuranceId);
      window.clearTimeout(actionsId);
    };
  }, [verificationState]);

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

    // The confirmed content replaces the status card through a fade rather
    // than a hard swap: the card fades out first, then the result mounts and
    // plays its own entrance (see result-page.styles).
    const showConfirmedContent = async () => {
      if (!prefersReducedMotion()) {
        setIsStatusLeaving(true);
        await wait(STATUS_LEAVE_MS);

        if (isDisposed) {
          return;
        }
      }

      setVerificationState("succeeded");
    };

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
            // This link cannot be checked from here (an old link, a new
            // browser, an expired session). Saying so is the only safe
            // answer: dropping the buyer into the checkout page without a
            // word invites a second payment for something already paid.
            if (response.status === 400 || response.status === 403) {
              setVerificationState("unavailable");
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
            await showConfirmedContent();
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
  }, [checkoutSessionId, failedPath, paymentIntentId, router]);

  if (verificationState === "succeeded") {
    return <>{children}</>;
  }

  const isUnavailable = verificationState === "unavailable";

  return (
    <>
      <StatusCard
        $isLeaving={isStatusLeaving}
        $kind={isUnavailable ? "notice" : "progress"}
        role={isUnavailable ? "alert" : "status"}
        aria-atomic="true"
        aria-live={isUnavailable ? "assertive" : "polite"}
      >
        {isUnavailable ? <StatusMark aria-hidden /> : <StatusSpinner />}
        <StatusText>
          {verificationState === "checking"
            ? isCheckingLong
              ? preparingText
              : checkingText
            : verificationState === "pending"
              ? pendingText
              : unavailableText}
        </StatusText>
      </StatusCard>
      {/* Header and footer are hidden on result pages, so the settled
          non-success states carry their own minimal way out. A processing
          payment gets a one-click status re-check (the copy asks to check
          again, so checking again must not require finding the reload
          button); the support button appears once the status truly could not
          be confirmed. */}
      {(verificationState !== "checking" || isCheckingSlow) && (
        <ResultActions>
          {verificationState === "pending" && (
            <Button
              buttonText={refreshButtonText}
              onClick={() => window.location.reload()}
            />
          )}
          {(isUnavailable || isCheckingSlow) && (
            <Button
              buttonText={supportButtonText}
              href={SUPPORT_TELEGRAM_URL}
              target="_blank"
            />
          )}
          <Button buttonText={homeButtonText} href="/" variant="secondary" />
        </ResultActions>
      )}
    </>
  );
}
