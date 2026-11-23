"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import Button from "@/components/common/Button";
import { StampIn } from "@/components/other/BlackFriday/BlackFridayMotion";

import {
  LegendButton,
  LegendSpot,
  LegendStamp,
  LegendTip,
  SaveSpot,
  SaveTip,
} from "./access-actions.styles";
import {
  CalendarApp,
  CalendarApps,
  CalendarHint,
  ShareButton,
  ShareHint,
  ShareSpot,
} from "./access-aside.styles";
import {
  AccessCard,
  ActionResult,
  CampaignMark,
  CardToggle,
  QuietButton,
  QuietLink,
} from "./access-cards.styles";

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
  const fold = useContext(FoldContext);

  // Done: the answer stays a moment, then the card folds (on a phone).
  useEffect(() => {
    if (state !== "sent" || !fold) return;
    const timer = setTimeout(fold, FOLD_AFTER_DONE_MS);
    return () => clearTimeout(timer);
  }, [fold, state]);

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
  appleLabel: string;
  copied: string;
  copiedHint: string;
  google: string;
  googleLabel: string;
  other: string;
  otherLabel: string;
};

const AppleLogo = () => (
  <svg aria-hidden fill="currentColor" viewBox="0 0 24 24">
    <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
  </svg>
);

const GoogleLogo = () => (
  <svg aria-hidden viewBox="0 0 48 48">
    <path
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      fill="#EA4335"
    />
    <path
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      fill="#4285F4"
    />
    <path
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      fill="#FBBC05"
    />
    <path
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      fill="#34A853"
    />
  </svg>
);

const OtherCalendar = () => (
  <svg
    aria-hidden
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    viewBox="0 0 16 16"
  >
    <rect height="11" rx="2.5" width="12" x="2" y="3" />
    <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" strokeLinecap="round" />
  </svg>
);

/**
 * The calendar subscription, one button per kind of calendar: Apple Calendar
 * (and Outlook) take a `webcal:` address, Google adds one through its own
 * page, any other calendar gets the address copied, with a word on where to
 * paste it. A browser cannot tell which calendar the reader uses, so all three
 * are offered.
 */
export function CalendarSubscribe({
  links,
  texts,
}: {
  links: { google: string; https: string; webcal: string };
  texts: SubscribeTexts;
}) {
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(links.https);
      setCopied(true);
    } catch {
      // Without clipboard access the other two buttons remain.
    }
  };

  return (
    <div>
      <CalendarApps>
        <CalendarApp aria-label={texts.appleLabel} href={links.webcal}>
          <AppleLogo />
          {texts.apple}
        </CalendarApp>
        <CalendarApp
          aria-label={texts.googleLabel}
          href={links.google}
          rel="noopener noreferrer"
          target="_blank"
        >
          <GoogleLogo />
          {texts.google}
        </CalendarApp>
        <CalendarApp
          aria-label={copied ? texts.copied : texts.otherLabel}
          as="button"
          onClick={copyAddress}
          type="button"
        >
          {copied ? <CheckIcon /> : <OtherCalendar />}
          {copied ? texts.copied : texts.other}
        </CalendarApp>
      </CalendarApps>
      {copied && <CalendarHint role="status">{texts.copiedHint}</CalendarHint>}
    </div>
  );
}

const LockIcon = () => (
  <svg
    aria-hidden
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    viewBox="0 0 16 16"
  >
    <rect height="7.5" rx="2" width="10" x="3" y="7" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" strokeLinecap="round" />
  </svg>
);

/**
 * «Сохранить личную ссылку», a quiet action in the header's facts: the page's
 * own address to the phone's share sheet, or copied on a desktop. A lock and a
 * hint on hover say what the link is: this reader's own, opening only their
 * purchases.
 */
export function SavePageLink({
  texts,
  title,
}: {
  texts: { private: string; save: string; saved: string };
  title: string;
}) {
  const [saved, confirmSaved] = useConfirmation();

  const save = async () => {
    const result = await shareOrCopy({ title, url: window.location.href });
    if (result === "copied") confirmSaved();
  };

  return (
    <SaveSpot>
      <QuietButton
        aria-describedby="access-save-tip"
        aria-live="polite"
        onClick={save}
        type="button"
      >
        {saved ? <CheckIcon /> : <LockIcon />}
        {saved ? texts.saved : texts.save}
      </QuietButton>
      {/* Once copied, the confirmation says the same: the tip steps aside. */}
      {!saved && (
        <SaveTip id="access-save-tip" role="tooltip">
          {texts.private}
        </SaveTip>
      )}
    </SaveSpot>
  );
}

/**
 * A stamp in the header — «Легенда группы» in the site's wine ink, «Подряд» in
 * black: a pilgrim's stamp with the name around the top, «FRAME UP · ANNA STROK»
 * below, the number of cycles in the middle on a ribbon, a little uneven like a
 * real print. The description shows on hover, on keyboard focus and on a tap.
 */
export function CycleStamp({
  count,
  ink,
  texts,
}: {
  count: number;
  ink: "wine" | "black";
  texts: { label: string; name: string; text: string; unit: string };
}) {
  const [open, setOpen] = useState(false);
  const spot = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!spot.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <LegendSpot data-medal="" ref={spot}>
      <LegendButton
        aria-describedby={`${id}-tip`}
        aria-label={texts.label}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
        type="button"
      >
        <LegendStamp aria-hidden data-ink={ink} viewBox="0 0 100 100">
          <defs>
            {/* The ink: a few unprinted specks and slightly wavering edges. */}
            <filter height="110%" id={`${id}-ink`} width="110%" x="-5%" y="-5%">
              <feTurbulence
                baseFrequency="1.3"
                numOctaves={1}
                result="grain"
                seed={11}
                type="fractalNoise"
              />
              <feColorMatrix
                in="grain"
                result="specks"
                type="matrix"
                values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -11 7.6"
              />
              <feComposite in="SourceGraphic" in2="specks" operator="in" result="print" />
              <feTurbulence
                baseFrequency="0.07"
                numOctaves={1}
                result="wave"
                seed={3}
                type="fractalNoise"
              />
              <feDisplacementMap
                in="print"
                in2="wave"
                scale="0.45"
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
            <path d="M17.5,50 A32.5,32.5 0 0,1 82.5,50" id={`${id}-top`} />
            <path d="M11,50 A39,39 0 0,0 89,50" id={`${id}-bottom`} />
          </defs>
          <g filter={`url(#${id}-ink)`}>
            <circle className="rim" cx="50" cy="50" r="47" />
            <circle className="line" cx="50" cy="50" r="44" />
            <circle className="inner" cx="50" cy="50" r="26.5" />
            <circle className="line thin" cx="50" cy="50" r="24.6" />
            <text className="name">
              <textPath href={`#${id}-top`} startOffset="50%">
                {texts.name.toLocaleUpperCase()}
              </textPath>
            </text>
            <text className="brand">
              <textPath href={`#${id}-bottom`} startOffset="50%">
                FRAME UP · ANNA STROK
              </textPath>
            </text>
            <text className="count" x="50" y="54.5">
              {count}
            </text>
            <path d="M24 60.5 H76 L72.5 64.8 L76 69.1 H24 L27.5 64.8 Z" />
            <text className="unit" x="50" y="66.8">
              {texts.unit.toLocaleUpperCase()}
            </text>
          </g>
        </LegendStamp>
      </LegendButton>
      <LegendTip data-open={open ? "" : undefined} id={`${id}-tip`} role="tooltip">
        {texts.text}
      </LegendTip>
    </LegendSpot>
  );
}

/** How long the share hint stays, and the pause before it shows. */
const HINT_MS = 5000;
const HINT_DELAY_MS = 500;

/**
 * The share mark of a «Твой путь» step: the course's public page, never this
 * one. The first mark of the path carries a hint («Нажми, чтобы поделиться»):
 * once per visit, a moment after the mark comes into view, for a few seconds.
 */
export function ShareCourse({
  hint,
  label,
  texts,
  title,
  url,
}: {
  hint?: string;
  label: string;
  texts: { copied: string };
  title: string;
  url: string;
}) {
  const [copied, confirmCopy] = useConfirmation();
  const [hinting, setHinting] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!hint || !node || typeof IntersectionObserver === "undefined") return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        timers.push(
          setTimeout(() => {
            setHinting(true);
            timers.push(setTimeout(() => setHinting(false), HINT_MS));
          }, HINT_DELAY_MS),
        );
      },
      { threshold: 0.6 },
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [hint]);

  const share = async () => {
    setHinting(false);
    const result = await shareOrCopy({ title, url });
    if (result === "copied") confirmCopy();
  };

  return (
    <ShareSpot>
      {hinting && !copied && <ShareHint aria-hidden>{hint}</ShareHint>}
      <ShareButton
        aria-label={copied ? texts.copied : label}
        data-copied={copied ? "" : undefined}
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

/** Lets something inside an open card fold it once its job is done. */
const FoldContext = createContext<(() => void) | null>(null);

/** How long a done action's answer stays in sight before its card folds. */
const FOLD_AFTER_DONE_MS = 2600;

/**
 * A card that a phone shows folded: its head and count, the rest on a tap. A
 * card with nothing more to show has no fold at all. A desktop always shows it
 * whole, so the toggle exists only on a phone. Folded or not is decided on the
 * server, so nothing moves on load.
 */
export function FoldingCard({
  campaign = false,
  children,
  defaultOpen,
  detailsId,
  foldable,
  label,
}: {
  /** Bought on Black Friday: the card wears the campaign edge. */
  campaign?: boolean;
  children: ReactNode;
  defaultOpen: boolean;
  detailsId: string;
  foldable: boolean;
  label: string;
}) {
  const [open, setOpen] = useState(defaultOpen || !foldable);
  const fold = useCallback(() => {
    if (foldable) setOpen(false);
  }, [foldable]);

  return (
    <AccessCard data-campaign={campaign || undefined} data-open={open ? "true" : "false"}>
      {foldable && (
        <CardToggle
          aria-controls={detailsId}
          aria-expanded={open}
          aria-label={label}
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          <span aria-hidden />
        </CardToggle>
      )}
      <FoldContext.Provider value={fold}>{children}</FoldContext.Provider>
    </AccessCard>
  );
}

/** The Black Friday mark of a card, landing like a stamp when first seen. */
export function CampaignMarkStamp({ children }: { children: ReactNode }) {
  return <StampIn as={CampaignMark}>{children}</StampIn>;
}
