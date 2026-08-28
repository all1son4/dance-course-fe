"use client";

import { useEffect, useState } from "react";

import Button from "@/components/common/Button";

import { StatusCard, StatusMark, StatusSpinner, StatusText } from "../result-page.styles";

type TelegramAccessButtonProps = {
  activeText: string;
  buttonText: string;
  checkoutSessionId: string;
  inspirationButtonText: string;
  mainButtonText: string;
  onInspirationExpiryChange?: (expiresAt: string) => void;
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

const getInspirationAccessExpiry = (accesses: TelegramAccess[]): string =>
  accesses.find((access) => access.accessKey === "inspiration-hub")?.accessExpiresAt ??
  "";

const containsUnavailableAccess = (accesses: TelegramAccess[]): boolean =>
  accesses.some(
    (access) => access.status === "expired" || access.status === "unavailable",
  );

export default function TelegramAccessButton({
  activeText,
  buttonText,
  checkoutSessionId,
  inspirationButtonText,
  mainButtonText,
  onInspirationExpiryChange,
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
  const [statusKind, setStatusKind] = useState<AccessStatusKind>("pending");
  const [statusText, setStatusText] = useState(pendingText);
  const isContextValid = Boolean(checkoutSessionId && offerId && productId);
  const hasUnavailableAccess = containsUnavailableAccess(accesses);

  useEffect(() => {
    onInspirationExpiryChange?.(getInspirationAccessExpiry(accesses));
  }, [accesses, onInspirationExpiryChange]);

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

    const markAttemptAsPending = (): void => {
      if (!isDisposed) {
        setStatusKind("pending");
        setStatusText(pendingText);
      }
    };

    const markAccessAsUnavailable = (): void => {
      setStatusKind("unavailable");
      setStatusText(unavailableText);
    };

    const requestAccessLink = async (attempt: number): Promise<void> => {
      markAttemptAsPending();

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
          return;
        }

        if (data.status === "ready" && data.accesses?.length) {
          setAccesses(data.accesses);
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

  const renderSupportButton = (variant: "primary" | "secondary") => (
    <Button
      buttonText={supportButtonText}
      href={supportHref}
      target="_blank"
      variant={variant}
    />
  );

  const renderNotice = (key: string, text: string) => (
    <StatusCard key={key} $kind="notice" role="status">
      <StatusMark aria-hidden />
      <StatusText>{text}</StatusText>
    </StatusCard>
  );

  if (accessUrl) {
    return <Button buttonText={buttonText} href={accessUrl} target="_blank" />;
  }

  if (accesses.length) {
    // Ready links first (all of them in red - they are the point of the
    // page), then whatever could not be opened, then the way to support if
    // anything is off - every piece as wide as the card's action column.
    const readyAccesses = accesses.filter(
      (access) => access.status === "ready" && access.accessUrl,
    );
    const otherAccesses = accesses.filter((access) => !readyAccesses.includes(access));
    const labelOf = (access: TelegramAccess) =>
      access.accessKey === "inspiration-hub" ? inspirationButtonText : mainButtonText;

    return (
      <>
        {readyAccesses.map((access) => (
          <Button
            key={access.accessKey}
            buttonText={labelOf(access)}
            href={access.accessUrl}
            target="_blank"
          />
        ))}
        {otherAccesses.map((access) =>
          renderNotice(
            access.accessKey,
            `${labelOf(access)}: ${access.status === "active" ? activeText : unavailableText}`,
          ),
        )}
        {hasUnavailableAccess ? renderSupportButton("secondary") : null}
      </>
    );
  }

  if (!isContextValid || statusKind === "unavailable") {
    return (
      <>
        {renderNotice("unavailable", unavailableText)}
        {renderSupportButton("primary")}
      </>
    );
  }

  return (
    <StatusCard $kind="progress" role="status" aria-live="polite" aria-atomic="true">
      <StatusSpinner />
      <StatusText>{statusText}</StatusText>
    </StatusCard>
  );
}
