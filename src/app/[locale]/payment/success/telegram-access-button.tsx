"use client";

import { useEffect, useState } from "react";
import styled, { keyframes } from "styled-components";

import { Button } from "@/components";

type TelegramAccessButtonProps = {
  buttonText: string;
  checkoutSessionId: string;
  offerId: string;
  paymentIntentId: string;
  pendingText: string;
  productId: string;
  retryButtonText: string;
  supportButtonText: string;
  supportHref: string;
  unavailableText: string;
};

type AccessLinkResponse =
  | {
      accessUrl: string;
      status: "ready";
      tokenExpiresAt?: string;
    }
  | {
      status: "not_available" | "pending";
    };

type AccessLinkErrorResponse = {
  errorCode?: string;
};

const pulse = keyframes`
  0% {
    opacity: 0.24;
    transform: translateY(0);
  }

  40% {
    opacity: 1;
    transform: translateY(-1px);
  }

  100% {
    opacity: 0.24;
    transform: translateY(0);
  }
`;

const StatusBox = styled.div<{ $kind: "pending" | "unavailable" }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 14px;
  min-height: 56px;
  background: ${({ $kind }) =>
    $kind === "pending" ? "rgba(124, 0, 2, 0.06)" : "rgba(0, 0, 0, 0.035)"};
  border: 1px solid
    ${({ $kind }) =>
      $kind === "pending" ? "rgba(124, 0, 2, 0.18)" : "rgba(0, 0, 0, 0.12)"};
`;

const Dots = styled.span`
  display: inline-flex;
  gap: 4px;
  min-width: 28px;
`;

const Dot = styled.span<{ $delayMs: number }>`
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: rgba(124, 0, 2, 0.88);
  animation: ${pulse} 0.95s ease-in-out infinite;
  animation-delay: ${({ $delayMs }) => `${$delayMs}ms`};
`;

const StatusText = styled.p`
  font-weight: 300;
  font-size: 14.5px;
  line-height: 140%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(16, 16, 16, 0.88);
`;

const StatusActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-wrap: wrap;
`;

const ActionButton = styled.button`
  border: 1px solid rgba(16, 16, 16, 0.2);
  background: rgba(255, 255, 255, 0.7);
  color: rgba(16, 16, 16, 0.92);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
`;

const SupportLink = styled.a`
  border: 1px solid rgba(16, 16, 16, 0.2);
  background: rgba(255, 255, 255, 0.7);
  color: rgba(16, 16, 16, 0.92);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 13px;
  line-height: 1;
  white-space: nowrap;
  text-decoration: none;
`;

const MAX_RETRY_ATTEMPTS = 40;
const RETRY_BASE_DELAY_MS = 1_500;
const RETRY_MAX_DELAY_MS = 5_000;

const getRetryDelayMs = (attempt: number) =>
  Math.min(RETRY_BASE_DELAY_MS + attempt * 180, RETRY_MAX_DELAY_MS);

export default function TelegramAccessButton({
  buttonText,
  checkoutSessionId,
  offerId,
  paymentIntentId,
  pendingText,
  productId,
  retryButtonText,
  supportButtonText,
  supportHref,
  unavailableText,
}: TelegramAccessButtonProps) {
  const [accessUrl, setAccessUrl] = useState("");
  const [statusKind, setStatusKind] = useState<"pending" | "unavailable">("pending");
  const [statusText, setStatusText] = useState(pendingText);
  const [requestNonce, setRequestNonce] = useState(0);
  const isContextValid = Boolean(checkoutSessionId && offerId && productId);

  useEffect(() => {
    if (!isContextValid) {
      return;
    }

    let isDisposed = false;

    const requestAccessLink = async (attempt: number) => {
      try {
        const response = await fetch("/api/telegram/access-link", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            checkoutSessionId,
            offerId,
            paymentIntentId,
            productId,
          }),
        });

        if (isDisposed) {
          return;
        }

        if (!response.ok) {
          const errorPayload = (await response
            .json()
            .catch(() => ({}))) as AccessLinkErrorResponse;
          const errorCode = errorPayload.errorCode ?? "";
          const isHardFailure =
            response.status === 403 ||
            errorCode === "missing_checkout_session_id" ||
            errorCode === "payment_access_denied" ||
            errorCode === "payment_context_mismatch";

          if (!isHardFailure && attempt < MAX_RETRY_ATTEMPTS) {
            window.setTimeout(() => {
              void requestAccessLink(attempt + 1);
            }, getRetryDelayMs(attempt));
            return;
          }

          setStatusKind("unavailable");
          setStatusText(unavailableText);
          return;
        }

        const data = (await response.json()) as AccessLinkResponse;

        if (isDisposed) {
          return;
        }

        if (data.status === "ready" && data.accessUrl) {
          setAccessUrl(data.accessUrl);
          return;
        }

        if (data.status === "pending" && attempt < MAX_RETRY_ATTEMPTS) {
          setStatusKind("pending");
          setStatusText(pendingText);
          window.setTimeout(() => {
            void requestAccessLink(attempt + 1);
          }, getRetryDelayMs(attempt));
          return;
        }

        setStatusKind("unavailable");
        setStatusText(unavailableText);
      } catch {
        if (attempt < MAX_RETRY_ATTEMPTS) {
          window.setTimeout(() => {
            void requestAccessLink(attempt + 1);
          }, getRetryDelayMs(attempt));
          return;
        }

        setStatusKind("unavailable");
        setStatusText(unavailableText);
      }
    };

    void requestAccessLink(0);

    return () => {
      isDisposed = true;
    };
  }, [
    checkoutSessionId,
    isContextValid,
    offerId,
    paymentIntentId,
    pendingText,
    productId,
    requestNonce,
    unavailableText,
  ]);

  if (accessUrl) {
    return <Button buttonText={buttonText} href={accessUrl} target="_blank" />;
  }

  if (!isContextValid) {
    return (
      <StatusBox $kind="unavailable" role="status" aria-live="polite" aria-atomic="true">
        <StatusText>{unavailableText}</StatusText>
      </StatusBox>
    );
  }

  return (
    <StatusBox $kind={statusKind} role="status" aria-live="polite" aria-atomic="true">
      {statusKind === "pending" ? (
        <Dots aria-hidden>
          <Dot $delayMs={0} />
          <Dot $delayMs={120} />
          <Dot $delayMs={240} />
        </Dots>
      ) : null}
      <StatusText>{statusText}</StatusText>
      {statusKind === "unavailable" ? (
        <StatusActions>
          <ActionButton onClick={() => setRequestNonce((prev) => prev + 1)} type="button">
            {retryButtonText}
          </ActionButton>
          <SupportLink href={supportHref} target="_blank" rel="noopener noreferrer">
            {supportButtonText}
          </SupportLink>
        </StatusActions>
      ) : null}
    </StatusBox>
  );
}
