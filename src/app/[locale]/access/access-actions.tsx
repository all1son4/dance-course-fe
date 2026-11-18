"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import Button from "@/components/common/Button";

import {
  AccessCard,
  ActionResult,
  CardToggle,
  QuietButton,
  QuietLink,
  ShareButton,
  ShareHint,
  ShareSpot,
  ToolChoices,
} from "./page.styles";

/*
 * The few interactive parts of «Мой доступ». Everything else is rendered on the
 * server; these only post, share or copy.
 */

const CONFIRM_MS = 2600;

const CheckIcon = () => (
  <svg
    aria-hidden
    viewBox="0 0 18 18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
  >
    <path d="m4 9.4 3.2 3.1L14 5.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const AlertIcon = () => (
  <svg
    aria-hidden
    viewBox="0 0 18 18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
  >
    <circle cx="9" cy="9" r="7.2" />
    <path d="M9 5.4v4.2" strokeLinecap="round" />
    <circle cx="9" cy="12.4" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

/* Three linked dots: sharing, without an arrow. */
const ShareIcon = () => (
  <svg
    aria-hidden
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
  >
    <circle cx="4" cy="8" r="2" />
    <circle cx="12" cy="3.6" r="2" />
    <circle cx="12" cy="12.4" r="2" />
    <path d="m5.8 7 4.4-2.4M5.8 9l4.4 2.4" />
  </svg>
);

/**
 * The phone's share sheet where there is one (it also offers notes, messengers and
 * the home screen); a copied link everywhere else. Desktop share sheets are left
 * out on purpose: a copied link is what people expect there.
 */
const shareOrCopy = async ({ title, url }: { title: string; url: string }) => {
  const prefersSheet =
    typeof navigator.share === "function" &&
    window.matchMedia("(pointer: coarse)").matches;

  if (prefersSheet) {
    try {
      await navigator.share({ title, url });
      return "shared" as const;
    } catch (error) {
      // Closing the sheet is a choice, not a failure.
      if (error instanceof DOMException && error.name === "AbortError") {
        return "dismissed" as const;
      }
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return "copied" as const;
  } catch {
    return "failed" as const;
  }
};

/** A label that says «Скопировано» for a moment, then goes back. */
const useConfirmation = () => {
  const [confirmed, setConfirmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const confirm = () => {
    setConfirmed(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setConfirmed(false), CONFIRM_MS);
  };

  return [confirmed, confirm] as const;
};

type ReissueTexts = {
  button: string;
  failed: string;
  limited: string;
  sent: string;
  support: string;
};

/** «Прислать новую ссылку»: asks the server to email a fresh invite; never shows it. */
export function ReissueInvite({
  cardId,
  supportHref,
  texts,
  token,
}: {
  cardId: string;
  supportHref: string;
  texts: ReissueTexts;
  token: string;
}) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "limited" | "failed">(
    "idle",
  );

  const send = async () => {
    setState("sending");
    try {
      const response = await fetch("/api/access/invite", {
        body: JSON.stringify({ card: cardId, k: token }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      setState(response.ok ? "sent" : response.status === 429 ? "limited" : "failed");
    } catch {
      setState("failed");
    }
  };

  if (state === "sent") {
    return (
      <ActionResult $tone="ok" role="status">
        <CheckIcon />
        <span>{texts.sent}</span>
      </ActionResult>
    );
  }

  if (state === "limited" || state === "failed") {
    return (
      <ActionResult $tone="error" role="alert">
        <AlertIcon />
        <span>
          {state === "limited" ? texts.limited : texts.failed}{" "}
          <a href={supportHref} rel="noopener noreferrer" target="_blank">
            {texts.support}
          </a>
        </span>
      </ActionResult>
    );
  }

  return (
    <>
      <Button
        analytics={{ id: "my_access_reissue_invite", placement: "my_access_card" }}
        buttonText={texts.button}
        data-primary=""
        isLoading={state === "sending"}
        onClick={send}
        size="xs"
        width="max-content"
      />
      <QuietLink href={supportHref} rel="noopener noreferrer" target="_blank">
        {texts.support}
      </QuietLink>
    </>
  );
}

type SubscribeTexts = {
  apple: string;
  copied: string;
  copyAddress: string;
  google: string;
  subscribe: string;
};

/**
 * «Подписаться»: the calendar apps appear under the button, so the reader picks
 * theirs; there is no reliable way to tell from a browser which one they use.
 */
export function CalendarSubscribe({
  links,
  texts,
}: {
  links: { google: string; https: string; webcal: string };
  texts: SubscribeTexts;
}) {
  const [open, setOpen] = useState(false);
  const [copied, confirmCopy] = useConfirmation();

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(links.https);
      confirmCopy();
    } catch {
      // Without clipboard access the other two choices remain.
    }
  };

  return (
    <div>
      <QuietButton
        aria-controls="access-calendar-apps"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {texts.subscribe}
      </QuietButton>
      {open && (
        <ToolChoices id="access-calendar-apps">
          <li>
            <QuietLink href={links.webcal}>{texts.apple}</QuietLink>
          </li>
          <li>
            <QuietLink href={links.google} rel="noopener noreferrer" target="_blank">
              {texts.google}
            </QuietLink>
          </li>
          <li>
            <QuietButton onClick={copyAddress} type="button">
              {copied ? texts.copied : texts.copyAddress}
            </QuietButton>
          </li>
        </ToolChoices>
      )}
    </div>
  );
}

/** «Сохранить ссылку»: the page's own address to the share sheet or the clipboard. */
export function SavePageLink({
  texts,
  title,
}: {
  texts: { save: string; saved: string };
  title: string;
}) {
  const [saved, confirmSaved] = useConfirmation();

  const save = async () => {
    const result = await shareOrCopy({ title, url: window.location.href });
    if (result === "copied") confirmSaved();
  };

  return (
    <QuietButton aria-live="polite" onClick={save} type="button">
      {saved ? texts.saved : texts.save}
    </QuietButton>
  );
}

/** How long the «Поделись» hint stays beside the share mark. */
const HINT_MS = 3200;

type ShareHintState = {
  active: string | null;
  claim: (id: string, node: Element) => void;
  text: string;
};
const ShareHintContext = createContext<ShareHintState | null>(null);

/**
 * Once per visit: the first share mark (in reading order) that comes fully into
 * view gets a short «Поделись» hint, then it goes away. A new visit, a new mount,
 * shows it again.
 */
export function ShareHintScope({
  children,
  text,
}: {
  children: ReactNode;
  text: string;
}) {
  const claimed = useRef(false);
  const candidates = useRef<{ id: string; node: Element }[]>([]);
  const frame = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [active, setActive] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // Marks that come into view together are collected for a frame, then the
  // first of them in the document wins.
  const claim = useCallback((id: string, node: Element) => {
    if (claimed.current) return;
    candidates.current.push({ id, node });
    if (frame.current !== null) return;

    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const [first] = candidates.current.sort((a, b) =>
        a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING
          ? -1
          : 1,
      );
      candidates.current = [];
      if (!first || claimed.current) return;

      claimed.current = true;
      setActive(first.id);
      timer.current = setTimeout(() => setActive(null), HINT_MS);
    });
  }, []);

  const value = useMemo(() => ({ active, claim, text }), [active, claim, text]);
  return <ShareHintContext.Provider value={value}>{children}</ShareHintContext.Provider>;
}

/** The share mark of a «Твой путь» step: the course's public page, never this one. */
export function ShareCourse({
  label,
  texts,
  title,
  url,
}: {
  label: string;
  texts: { copied: string };
  title: string;
  url: string;
}) {
  const [copied, confirmCopy] = useConfirmation();
  const hint = useContext(ShareHintContext);
  const id = useId();
  const ref = useRef<HTMLButtonElement>(null);
  const claim = hint?.claim;

  useEffect(() => {
    const node = ref.current;
    if (!node || !claim || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          claim(id, node);
          observer.disconnect();
        }
      },
      { threshold: 1 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [claim, id]);

  const share = async () => {
    const result = await shareOrCopy({ title, url });
    if (result === "copied") confirmCopy();
  };

  return (
    <ShareSpot>
      {hint?.active === id && !copied && <ShareHint aria-hidden>{hint.text}</ShareHint>}
      <ShareButton
        aria-label={copied ? texts.copied : label}
        onClick={share}
        ref={ref}
        title={copied ? texts.copied : label}
        type="button"
      >
        {copied ? <CheckIcon /> : <ShareIcon />}
      </ShareButton>
    </ShareSpot>
  );
}

/**
 * A card that a phone shows folded: its head and a summary line, the rest on a
 * tap. A desktop always shows it whole, so the toggle exists only on a phone.
 * Folded or not is decided on the server, so nothing moves on load.
 */
export function FoldingCard({
  children,
  defaultOpen,
  detailsId,
  label,
}: {
  children: ReactNode;
  defaultOpen: boolean;
  detailsId: string;
  label: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <AccessCard data-open={open ? "true" : "false"}>
      <CardToggle
        aria-controls={detailsId}
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
        type="button"
      />
      {children}
    </AccessCard>
  );
}
