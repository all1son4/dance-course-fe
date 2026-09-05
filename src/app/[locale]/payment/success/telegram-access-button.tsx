"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import Button from "@/components/common/Button";
import { useCookieConsent } from "@/components/common/CookieConsent";
import { trackAnalyticsEvent } from "@/lib/mixpanel-analytics";

import { StatusCard, StatusMark, StatusSpinner, StatusText } from "../result-page.styles";

type TelegramAccessButtonProps = {
  /** Names the access in a notice, where a button label would read as an order. */
  accessNames: { inspiration: string; main: string };
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

const getAccessAnalyticsResult = ({
  accesses,
  accessUrl,
  isContextValid,
  statusKind,
}: {
  accesses: TelegramAccess[];
  accessUrl: string;
  isContextValid: boolean;
  statusKind: AccessStatusKind;
}) => {
  if (!isContextValid) {
    return {
      active_access_count: 0,
      ready_access_count: 0,
      status: "invalid_context" as const,
      unavailable_access_count: 0,
    };
  }

  if (accessUrl) {
    return {
      active_access_count: 0,
      ready_access_count: 1,
      status: "ready" as const,
      unavailable_access_count: 0,
    };
  }

  if (accesses.length) {
    const activeAccessCount = accesses.filter(
      (access) => access.status === "active",
    ).length;
    const readyAccessCount = accesses.filter(
      (access) => access.status === "ready" && access.accessUrl,
    ).length;
    const unavailableAccessCount = accesses.filter(
      (access) => access.status === "expired" || access.status === "unavailable",
    ).length;
    const hasAvailableAccess = activeAccessCount + readyAccessCount > 0;
    const status =
      unavailableAccessCount > 0 && hasAvailableAccess
        ? ("partial" as const)
        : readyAccessCount > 0
          ? ("ready" as const)
          : activeAccessCount > 0
            ? ("already_active" as const)
            : ("unavailable" as const);

    return {
      active_access_count: activeAccessCount,
      ready_access_count: readyAccessCount,
      status,
      unavailable_access_count: unavailableAccessCount,
    };
  }

  if (statusKind === "unavailable") {
    return {
      active_access_count: 0,
      ready_access_count: 0,
      status: "unavailable" as const,
      unavailable_access_count: 0,
    };
  }

  return null;
};

export default function TelegramAccessButton({
  accessNames,
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
  const { canUseAnalytics } = useCookieConsent();
  const [accessUrl, setAccessUrl] = useState("");
  const [accesses, setAccesses] = useState<TelegramAccess[]>([]);
  const [statusKind, setStatusKind] = useState<AccessStatusKind>("pending");
  const [statusText, setStatusText] = useState(pendingText);
  const isContextValid = Boolean(checkoutSessionId && offerId && productId);
  const hasUnavailableAccess = containsUnavailableAccess(accesses);
  const trackedAccessResultsRef = useRef(new Set<string>());
  const accessAnalyticsResult = useMemo(
    () =>
      getAccessAnalyticsResult({
        accesses,
        accessUrl,
        isContextValid,
        statusKind,
      }),
    [accesses, accessUrl, isContextValid, statusKind],
  );

  useEffect(() => {
    if (!canUseAnalytics || !accessAnalyticsResult) {
      return;
    }

    const resultKey = JSON.stringify(accessAnalyticsResult);

    if (trackedAccessResultsRef.current.has(resultKey)) {
      return;
    }

    trackedAccessResultsRef.current.add(resultKey);
    void trackAnalyticsEvent("post_purchase_access_result", {
      ...accessAnalyticsResult,
      offer_id: offerId,
      product_id: productId,
    });
  }, [accessAnalyticsResult, canUseAnalytics, offerId, productId]);

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
      analytics={{
        id: "post_purchase_contact_support",
        offer_id: offerId,
        placement: "access_result",
        product_id: productId,
      }}
    />
  );

  const renderNotice = (key: string, text: string) => (
    <StatusCard key={key} $kind="notice" role="status">
      <StatusMark aria-hidden />
      <StatusText>{text}</StatusText>
    </StatusCard>
  );

  if (accessUrl) {
    return (
      <Button
        buttonText={buttonText}
        href={accessUrl}
        target="_blank"
        analytics={{
          id: "post_purchase_access_opened",
          offer_id: offerId,
          placement: "legacy_access",
          product_id: productId,
        }}
      />
    );
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
    const nameOf = (access: TelegramAccess) =>
      access.accessKey === "inspiration-hub" ? accessNames.inspiration : accessNames.main;

    return (
      <>
        {readyAccesses.map((access) => (
          <Button
            key={access.accessKey}
            buttonText={labelOf(access)}
            href={access.accessUrl}
            target="_blank"
            analytics={{
              id: "post_purchase_access_opened",
              offer_id: offerId,
              placement: access.accessKey,
              product_id: productId,
            }}
          />
        ))}
        {otherAccesses.map((access) =>
          renderNotice(
            access.accessKey,
            `${nameOf(access)}: ${access.status === "active" ? activeText : unavailableText}`,
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
