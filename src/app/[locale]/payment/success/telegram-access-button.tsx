"use client";

import { useEffect, useState } from "react";
import styled, { keyframes } from "styled-components";

import Button from "@/components/common/Button";

type TelegramAccessButtonProps = {
  activeText: string;
  buttonText: string;
  checkoutSessionId: string;
  inspirationButtonText: string;
  mainButtonText: string;
  onAccessCountChange?: (count: number) => void;
  onInspirationExpiryChange?: (expiresAt: string) => void;
  onUnavailableChange?: (isUnavailable: boolean) => void;
  offerId: string;
  paymentIntentId: string;
  pendingText: string;
  productId: string;
  supportButtonText: string;
  supportHref: string;
  unavailableText: string;
};

type TelegramAccess = {
  accessExpiresAt: string;
  accessKey: "inspiration-hub" | "main-group";
  accessUrl: string;
  status: "active" | "expired" | "ready" | "unavailable";
  tokenExpiresAt: string;
};

type AccessLinkResponse = {
  accesses?: TelegramAccess[];
  accessUrl?: string;
  status: "not_available" | "pending" | "ready";
  tokenExpiresAt?: string;
};

type AccessLinkErrorResponse = {
  errorCode?: string;
};

type AccessStatusKind = "pending" | "unavailable";

const ACCESS_LINK_ENDPOINT = "/api/telegram/access-link";
const ACCESS_LINK_METHOD = "POST";
const JSON_CONTENT_TYPE = "application/json";
const NO_STORE_CACHE_MODE = "no-store";
const RETRY_AFTER_HEADER = "Retry-After";
const MAX_RETRY_ATTEMPTS = 15;
const RETRY_BASE_DELAY_MS = 1_500;
const RETRY_DELAY_INCREMENT_MS = 180;
const RETRY_MAX_DELAY_MS = 5_000;
const ACCESS_LINK_REQUEST_TIMEOUT_MS = 8_000;
const SERVER_RETRY_AFTER_MAX_MS = 30_000;
const MILLISECONDS_PER_SECOND = 1_000;

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

const StatusBox = styled.div<{ $kind: AccessStatusKind }>`
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 12px 16px;
  border-radius: 18px;
  min-height: 56px;
  background: ${({ $kind }) =>
    $kind === "pending" ? "rgba(124, 0, 2, 0.06)" : "rgba(0, 0, 0, 0.035)"};
  border: 1px solid
    ${({ $kind }) =>
      $kind === "pending" ? "rgba(124, 0, 2, 0.18)" : "rgba(0, 0, 0, 0.12)"};

  @media (max-width: 767px) {
    width: 100%;
  }
`;

const Dots = styled.span`
  display: inline-flex;
  gap: 4px;
  min-width: 28px;
`;

const Dot = styled.span<{ $delayMs: number }>`
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: rgba(124, 0, 2, 0.82);
  animation: ${pulse} 1.05s ease-in-out infinite;
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

const StatusTextBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const StatusMeta = styled.span`
  font-weight: 500;
  font-size: 11.5px;
  line-height: 140%;
  letter-spacing: 0;
  color: rgba(16, 16, 16, 0.55);
`;

const AccessList = styled.div<{ $multiple: boolean }>`
  display: flex;
  flex-direction: row;
  gap: 10px;
  width: ${({ $multiple }) => ($multiple ? "100%" : "auto")};
  flex: ${({ $multiple }) => ($multiple ? "1 0 100%" : "1 1 280px")};

  @media (max-width: 767px) {
    flex-direction: column;
    width: 100%;
    flex-basis: 100%;
  }
`;

const AccessItem = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-width: 0;
`;

const SupportAction = styled.div`
  display: flex;
  flex: 1 0 100%;
  width: 100%;
`;

const getRetryDelayMs = (attempt: number): number =>
  Math.min(RETRY_BASE_DELAY_MS + attempt * RETRY_DELAY_INCREMENT_MS, RETRY_MAX_DELAY_MS);

const parseRetryAfterMs = (retryAfterHeader: string | null): number | null => {
  if (!retryAfterHeader) {
    return null;
  }

  const retryAfterSeconds = Number(retryAfterHeader);

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.min(
      Math.round(retryAfterSeconds * MILLISECONDS_PER_SECOND),
      SERVER_RETRY_AFTER_MAX_MS,
    );
  }

  const retryAtUnixMs = Date.parse(retryAfterHeader);

  if (!Number.isFinite(retryAtUnixMs)) {
    return null;
  }

  return Math.min(Math.max(retryAtUnixMs - Date.now(), 0), SERVER_RETRY_AFTER_MAX_MS);
};

const isHardAccessLinkFailure = (responseStatus: number, errorCode: string): boolean =>
  responseStatus === 403 ||
  errorCode === "missing_checkout_session_id" ||
  errorCode === "payment_access_denied" ||
  errorCode === "payment_context_mismatch";

const getReportedAccessCount = (accessCount: number, accessUrl: string): number =>
  accessCount || (accessUrl ? 1 : 0);

const getInspirationAccessExpiry = (accesses: TelegramAccess[]): string =>
  accesses.find((access) => access.accessKey === "inspiration-hub")?.accessExpiresAt ??
  "";

const containsUnavailableAccess = (accesses: TelegramAccess[]): boolean =>
  accesses.some(
    (access) => access.status === "expired" || access.status === "unavailable",
  );

const containsUsableAccess = (accesses: TelegramAccess[]): boolean =>
  accesses.some((access) => access.status === "ready" || access.status === "active");

export default function TelegramAccessButton({
  activeText,
  buttonText,
  checkoutSessionId,
  inspirationButtonText,
  mainButtonText,
  onAccessCountChange,
  onInspirationExpiryChange,
  onUnavailableChange,
  offerId,
  paymentIntentId,
  pendingText,
  productId,
  supportButtonText,
  supportHref,
  unavailableText,
}: TelegramAccessButtonProps) {
  const [accessUrl, setAccessUrl] = useState("");
  const [accesses, setAccesses] = useState<TelegramAccess[]>([]);
  const [attemptCount, setAttemptCount] = useState(0);
  const [statusKind, setStatusKind] = useState<AccessStatusKind>("pending");
  const [statusText, setStatusText] = useState(pendingText);
  const isContextValid = Boolean(checkoutSessionId && offerId && productId);
  const hasUnavailableAccess = containsUnavailableAccess(accesses);

  useEffect(() => {
    onAccessCountChange?.(getReportedAccessCount(accesses.length, accessUrl));
  }, [accessUrl, accesses.length, onAccessCountChange]);

  useEffect(() => {
    onInspirationExpiryChange?.(getInspirationAccessExpiry(accesses));
  }, [accesses, onInspirationExpiryChange]);

  useEffect(() => {
    onUnavailableChange?.(
      hasUnavailableAccess ||
        (!accessUrl &&
          !containsUsableAccess(accesses) &&
          (!isContextValid || statusKind === "unavailable")),
    );
  }, [
    accessUrl,
    accesses,
    hasUnavailableAccess,
    isContextValid,
    onUnavailableChange,
    statusKind,
  ]);

  useEffect(() => {
    if (!isContextValid) {
      return;
    }

    let isDisposed = false;
    let activeAbortController: AbortController | null = null;
    const pendingTimeouts = new Set<number>();

    const scheduleNextAttempt = (callback: () => void, delayMs: number) => {
      const timeoutId = window.setTimeout(() => {
        pendingTimeouts.delete(timeoutId);
        callback();
      }, delayMs);
      pendingTimeouts.add(timeoutId);
    };

    const markAttemptAsPending = (attempt: number): void => {
      if (!isDisposed) {
        setStatusKind("pending");
        setStatusText(pendingText);
        setAttemptCount(Math.min(attempt + 1, MAX_RETRY_ATTEMPTS));
      }
    };

    const markAccessAsUnavailable = (): void => {
      setStatusKind("unavailable");
      setStatusText(unavailableText);
    };

    const requestAccessLink = async (attempt: number): Promise<void> => {
      markAttemptAsPending(attempt);

      const requestController = new AbortController();
      activeAbortController = requestController;
      // A single stalled poll must not prevent the bounded retry sequence.
      const requestTimeoutId = window.setTimeout(() => {
        requestController.abort();
      }, ACCESS_LINK_REQUEST_TIMEOUT_MS);
      pendingTimeouts.add(requestTimeoutId);

      try {
        const response = await fetch(ACCESS_LINK_ENDPOINT, {
          method: ACCESS_LINK_METHOD,
          headers: {
            "Content-Type": JSON_CONTENT_TYPE,
          },
          body: JSON.stringify({
            checkoutSessionId,
            offerId,
            paymentIntentId,
            productId,
          }),
          cache: NO_STORE_CACHE_MODE,
          signal: requestController.signal,
        });

        if (isDisposed) {
          return;
        }

        const retryAfterMs = parseRetryAfterMs(response.headers.get(RETRY_AFTER_HEADER));
        const scheduleRetry = (delayMs: number): void => {
          scheduleNextAttempt(() => {
            void requestAccessLink(attempt + 1);
          }, delayMs);
        };

        if (!response.ok) {
          const errorPayload = (await response
            .json()
            .catch(() => ({}))) as AccessLinkErrorResponse;
          const errorCode = errorPayload.errorCode ?? "";

          if (
            !isHardAccessLinkFailure(response.status, errorCode) &&
            attempt < MAX_RETRY_ATTEMPTS
          ) {
            scheduleRetry(retryAfterMs ?? getRetryDelayMs(attempt));
            return;
          }

          markAccessAsUnavailable();
          return;
        }

        const data = (await response.json()) as AccessLinkResponse;

        if (isDisposed) {
          return;
        }

        if (data.status === "ready" && data.accessUrl) {
          setAccessUrl(data.accessUrl);
          setAttemptCount(0);
          return;
        }

        if (data.status === "ready" && data.accesses?.length) {
          setAccesses(data.accesses);
          setAttemptCount(0);
          return;
        }

        if (data.status === "pending" && attempt < MAX_RETRY_ATTEMPTS) {
          setStatusKind("pending");
          setStatusText(pendingText);
          scheduleRetry(retryAfterMs ?? getRetryDelayMs(attempt));
          return;
        }

        markAccessAsUnavailable();
      } catch {
        if (attempt < MAX_RETRY_ATTEMPTS) {
          scheduleNextAttempt(() => {
            void requestAccessLink(attempt + 1);
          }, getRetryDelayMs(attempt));
          return;
        }

        markAccessAsUnavailable();
      } finally {
        window.clearTimeout(requestTimeoutId);
        pendingTimeouts.delete(requestTimeoutId);
      }
    };

    void requestAccessLink(0);

    return () => {
      isDisposed = true;
      activeAbortController?.abort();
      pendingTimeouts.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      pendingTimeouts.clear();
    };
  }, [
    checkoutSessionId,
    isContextValid,
    offerId,
    paymentIntentId,
    pendingText,
    productId,
    unavailableText,
  ]);

  const renderSupportButton = () => (
    <Button buttonText={supportButtonText} href={supportHref} target="_blank" />
  );

  const renderAccessItem = (access: TelegramAccess) => {
    const label =
      access.accessKey === "inspiration-hub" ? inspirationButtonText : mainButtonText;

    if (access.status === "ready" && access.accessUrl) {
      return (
        <AccessItem key={access.accessKey}>
          <Button buttonText={label} href={access.accessUrl} target="_blank" />
        </AccessItem>
      );
    }

    return (
      <StatusBox key={access.accessKey} $kind="unavailable" role="status">
        <StatusText>
          {label}: {access.status === "active" ? activeText : unavailableText}
        </StatusText>
      </StatusBox>
    );
  };

  if (accessUrl) {
    return <Button buttonText={buttonText} href={accessUrl} target="_blank" />;
  }

  if (accesses.length) {
    return (
      <AccessList $multiple={accesses.length > 1}>
        {accesses.map(renderAccessItem)}
        {hasUnavailableAccess ? (
          <SupportAction>
            <Button
              buttonText={supportButtonText}
              href={supportHref}
              target="_blank"
              variant="secondary"
            />
          </SupportAction>
        ) : null}
      </AccessList>
    );
  }

  if (!isContextValid) {
    return renderSupportButton();
  }

  if (statusKind === "unavailable") {
    return renderSupportButton();
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
      <StatusTextBox>
        <StatusText>{statusText}</StatusText>
        {attemptCount > 0 ? (
          <StatusMeta>
            {Math.min(attemptCount, MAX_RETRY_ATTEMPTS)}/{MAX_RETRY_ATTEMPTS}
          </StatusMeta>
        ) : null}
      </StatusTextBox>
    </StatusBox>
  );
}
