"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import Button from "@/components/common/Button";
import type { InvitationAccessLine } from "@/lib/access-invitations/service";
import { trackAnalyticsEvent } from "@/lib/mixpanel-analytics";

import {
  AccessCard,
  CardHead,
  CardList,
  CardNote,
  CardTitle,
  QuietLink,
} from "../access/access-cards.styles";
import { RequestCard } from "../access/page.styles";
import {
  loadTelegramLoginScript,
  requestTelegramIdToken,
} from "../payment/payment.telegram";
import { Lead, ResultTitle, StatusText, Step, Steps } from "./invitation.styles";

/** How long the page may sit in front with no answer from Telegram before the button unlocks. */
const TELEGRAM_WINDOW_CHECK_MS = 3000;
const KNOWN_LOGIN_ERRORS = new Set([
  "popup_closed",
  "telegram_login_script_failed",
  "telegram_login_unavailable",
]);

type Product = "standard" | "plus" | "hub";
type Phase = "ready" | "opening" | "checking" | "verified";

export type InvitationTexts = {
  steps: {
    confirm: string;
    confirmHint: string;
    links: string;
    linksHint: string;
    join: string;
    joinHint: string;
    label: string;
  };
  confirm: {
    lead: string;
    button: string;
    opening: string;
    checking: string;
    noWindow: string;
    closed: string;
    nonceRefreshed: string;
    network: string;
    failed: string;
    otherAccount: string;
    expired: string;
    revoked: string;
  };
  result: {
    title: string;
    lead: string;
    mainTitle: string;
    hubTitle: string;
    mainButton: string;
    hubButton: string;
    linkNote: string;
    member: string;
    extended: string;
    extendedPlain: string;
    scheduled: string;
    scheduledPlain: string;
    unavailable: string;
    expired: string;
    retry: string;
    newLink: string;
    limited: string;
    retryFailed: string;
    emailed: string;
    myAccess: string;
  };
};

type ConfirmResponse = {
  errorCode?: string;
  emailed?: boolean;
  limited?: boolean;
  lines?: InvitationAccessLine[];
  myAccessPath?: string | null;
  status?: string;
};

const formatDay = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "Europe/Warsaw" })
    .format(new Date(iso))
    .replace(/\s?г\./u, "")
    .replace(/ /gu, " ");

const ResultLine = ({
  line,
  locale,
  onRetry,
  retrying,
  texts,
}: {
  line: InvitationAccessLine;
  locale: string;
  onRetry: () => void;
  retrying: boolean;
  texts: InvitationTexts["result"];
}) => {
  const isHub = line.accessKey === "inspiration-hub";
  const needsRetry = line.state === "unavailable" || line.state === "expired";
  const note =
    line.state === "member"
      ? texts.member
      : line.state === "extended"
        ? line.until
          ? texts.extended.replace("{date}", formatDay(line.until, locale))
          : texts.extendedPlain
        : line.state === "scheduled"
          ? line.startsAt
            ? texts.scheduled.replace("{date}", formatDay(line.startsAt, locale))
            : texts.scheduledPlain
          : line.state === "unavailable"
            ? texts.unavailable
            : line.state === "expired"
              ? texts.expired
              : texts.linkNote;

  return (
    <AccessCard>
      <CardHead>
        <CardTitle>{isHub ? texts.hubTitle : texts.mainTitle}</CardTitle>
      </CardHead>
      <CardNote>{note}</CardNote>
      {line.state === "link" && (
        <Button
          analytics={{
            id: isHub ? "invitation_open_hub" : "invitation_join_chat",
            placement: "invitation_result",
          }}
          buttonText={isHub ? texts.hubButton : texts.mainButton}
          href={line.url}
          rel="noopener noreferrer"
          size="xs"
          target="_blank"
          width="max-content"
        />
      )}
      {needsRetry && (
        <Button
          analytics={{ id: "invitation_retry_links", placement: "invitation_result" }}
          buttonText={line.state === "expired" ? texts.newLink : texts.retry}
          isLoading={retrying}
          onClick={() => {
            if (!retrying) onRetry();
          }}
          size="xs"
          variant="secondary"
          width="max-content"
        />
      )}
    </AccessCard>
  );
};

/**
 * The renewal invitation: three steps, one Telegram button, then a line per access.
 * The Telegram window opens straight from the press (Safari blocks a window opened
 * after a wait); the script is loaded beforehand, and the button never stays locked.
 */
export default function InvitationFlow({
  clientId,
  initial,
  locale,
  nonce,
  product,
  texts,
  token,
}: {
  clientId: string;
  initial: { lines: InvitationAccessLine[]; myAccessPath: string | null } | null;
  locale: string;
  nonce: string;
  product: Product;
  texts: InvitationTexts;
  token: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(initial ? "verified" : "ready");
  const [message, setMessage] = useState<{ text: string; tone: "info" | "error" } | null>(
    null,
  );
  const [result, setResult] = useState(initial);
  const [emailed, setEmailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState("");
  const attemptRef = useRef(0);

  /** A failed or expired link: new links, shown here and sent by email. */
  const retry = async () => {
    setRetrying(true);
    setRetryMessage("");
    try {
      const response = await fetch("/api/invitation", {
        body: JSON.stringify({ action: "links", token }),
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json().catch(() => ({}))) as ConfirmResponse;
      if (response.ok && data.status === "verified" && data.lines) {
        setResult({ lines: data.lines, myAccessPath: data.myAccessPath ?? null });
        setEmailed(Boolean(data.emailed));
        setRetryMessage(
          data.limited
            ? texts.result.limited
            : data.lines.some(
                  (line) => line.state === "unavailable" || line.state === "expired",
                )
              ? texts.result.retryFailed
              : "",
        );
      } else {
        setRetryMessage(texts.result.retryFailed);
      }
    } catch {
      setRetryMessage(texts.result.retryFailed);
    } finally {
      setRetrying(false);
    }
  };

  useEffect(() => {
    if (!initial) void loadTelegramLoginScript().catch(() => undefined);
  }, [initial]);

  const fail = (text: string) => {
    setPhase("ready");
    setMessage({ text, tone: "error" });
  };

  const confirm = async () => {
    const attempt = ++attemptRef.current;
    const isLatest = () => attempt === attemptRef.current;
    let stage: "login" | "confirm" = "login";

    setPhase("opening");
    setMessage({ text: texts.confirm.opening, tone: "info" });
    void trackAnalyticsEvent("invitation_verification_started", {
      invitation_product: product,
    });

    try {
      if (!window.Telegram?.Login?.auth) await loadTelegramLoginScript();
      if (!window.Telegram?.Login?.auth) throw new Error("telegram_login_unavailable");

      // A blocked window, or one that never brings the answer back, leaves Telegram
      // silent: once the page has been in front a moment, the button works again.
      let inFrontSince: number | null = Date.now();
      const watch = window.setInterval(() => {
        if (document.visibilityState !== "visible" || !document.hasFocus()) {
          inFrontSince = null;
          return;
        }
        inFrontSince ??= Date.now();
        if (Date.now() - inFrontSince >= TELEGRAM_WINDOW_CHECK_MS && isLatest()) {
          window.clearInterval(watch);
          setPhase("ready");
          setMessage({ text: texts.confirm.noWindow, tone: "info" });
        }
      }, 500);

      const idToken = await requestTelegramIdToken({
        clientId: Number(clientId),
        locale,
        nonce,
      }).finally(() => window.clearInterval(watch));

      if (!isLatest()) return;

      stage = "confirm";
      setPhase("checking");
      setMessage({ text: texts.confirm.checking, tone: "info" });

      const response = await fetch("/api/invitation", {
        body: JSON.stringify({ idToken, nonce, token }),
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json().catch(() => ({}))) as ConfirmResponse;

      if (!isLatest()) return;

      if (response.ok && data.status === "verified" && data.lines) {
        setResult({ lines: data.lines, myAccessPath: data.myAccessPath ?? null });
        setEmailed(Boolean(data.emailed));
        setPhase("verified");
        setMessage(null);
        void trackAnalyticsEvent("invitation_verification_result", {
          invitation_product: product,
          link_count: data.lines.filter((line) => line.state === "link").length,
          member_count: data.lines.filter((line) => line.state === "member").length,
          result: "verified",
          verification_stage: stage,
        });
        window.focus();
        return;
      }

      const errorCode = data.errorCode ?? "other";

      if (errorCode === "invalid_telegram_login_nonce") {
        // The page outlived its login nonce: a fresh render brings a new one.
        router.refresh();
        fail(texts.confirm.nonceRefreshed);
      } else if (errorCode === "other_account") {
        fail(texts.confirm.otherAccount);
      } else if (errorCode === "expired" || errorCode === "invalid") {
        fail(texts.confirm.expired);
      } else if (errorCode === "revoked") {
        fail(texts.confirm.revoked);
      } else {
        fail(texts.confirm.failed);
      }

      void trackAnalyticsEvent("invitation_verification_result", {
        error_code: errorCode,
        invitation_product: product,
        result: errorCode === "other_account" ? "other_account" : "error",
        verification_stage: stage,
      });
    } catch (error) {
      if (!isLatest()) return;

      const code =
        error instanceof Error && KNOWN_LOGIN_ERRORS.has(error.message)
          ? error.message
          : stage === "confirm"
            ? "network"
            : "other";

      fail(
        code === "popup_closed"
          ? texts.confirm.closed
          : code === "network"
            ? texts.confirm.network
            : texts.confirm.failed,
      );
      void trackAnalyticsEvent("invitation_verification_result", {
        error_code: code,
        invitation_product: product,
        result: "error",
        verification_stage: stage,
      });
    }
  };

  const busy = phase === "opening" || phase === "checking";
  const stepState = (step: 1 | 2 | 3) =>
    phase === "verified" ? (step === 3 ? "now" : "done") : step === 1 ? "now" : "ahead";

  return (
    <RequestCard>
      <Steps aria-label={texts.steps.label}>
        {(
          [
            [1, texts.steps.confirm, texts.steps.confirmHint],
            [2, texts.steps.links, texts.steps.linksHint],
            [3, texts.steps.join, texts.steps.joinHint],
          ] as const
        ).map(([step, title, hint]) => {
          const state = stepState(step);
          return (
            <Step
              $state={state}
              aria-current={state === "now" ? "step" : undefined}
              key={step}
            >
              <i aria-hidden>{state === "done" ? "✓" : step}</i>
              <div>
                <b>{title}</b>
                <span>{hint}</span>
              </div>
            </Step>
          );
        })}
      </Steps>

      {phase === "verified" && result ? (
        <div aria-live="polite">
          <ResultTitle>{texts.result.title}</ResultTitle>
          <Lead>{texts.result.lead}</Lead>
          <CardList>
            {(result.lines.length > 0
              ? result.lines
              : // No access to show at all is a failure too: the retry and support.
                [
                  {
                    accessKey: product === "hub" ? "inspiration-hub" : "main-group",
                    state: "unavailable",
                  } as const,
                ]
            ).map((line) => (
              <ResultLine
                key={line.accessKey}
                line={line}
                locale={locale}
                onRetry={() => void retry()}
                retrying={retrying}
                texts={texts.result}
              />
            ))}
          </CardList>
          {retryMessage && (
            <StatusText $tone="error" aria-live="polite" role="status">
              {retryMessage}
            </StatusText>
          )}
          {emailed && <StatusText $tone="info">{texts.result.emailed}</StatusText>}
          {result.myAccessPath && (
            <QuietLink href={result.myAccessPath} rel="nofollow">
              {texts.result.myAccess}
            </QuietLink>
          )}
        </div>
      ) : (
        <>
          <Lead>{texts.confirm.lead}</Lead>
          <Button
            analytics={{ id: "invitation_confirm_telegram", placement: "invitation" }}
            buttonText={texts.confirm.button}
            disabled={!clientId || !nonce}
            isLoading={busy}
            onClick={() => {
              if (!busy) void confirm();
            }}
            size="sm"
            width="max-content"
          />
          <StatusText $tone={message?.tone ?? "info"} aria-live="polite" role="status">
            {message?.text ?? ""}
          </StatusText>
        </>
      )}
    </RequestCard>
  );
}
