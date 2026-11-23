"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { useRouter } from "@/i18n/navigation";

import {
  CountdownCaption,
  CountdownHeading,
  CountdownInline,
  CountdownSoundButton,
  CountdownTile,
  CountdownTiles,
  CountdownUnit,
  FinalMark,
  FlipCard,
  FlipHalf,
} from "./BlackFriday.styles";
import {
  getCountdownSoundEnabled,
  getServerCountdownSoundEnabled,
  playCountdownTick,
  subscribeCountdownSound,
  toggleCountdownSound,
} from "./countdown-sound";

export type CountdownLabels = {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
};

type BlackFridayCountdownProps = {
  /** Shown above the tiles; replaced by `finalLabel` in the last 24 hours. */
  caption?: string;
  /** «Последние часы»: the last day says so, and the tiles turn red. */
  finalLabel: string;
  /** ISO end of the campaign. */
  endsAt: string;
  /** The server's clock at render: the first client render shows the same digits. */
  serverNow: number;
  labels: CountdownLabels;
  /** Accessible sentence before the time, e.g. "Until the end of the offer". */
  label: string;
  soundLabel: string;
  /** The campaign surface whose viewport visibility drives the sound. */
  soundTargetId: string;
  soundHidden?: boolean;
  variant: "tiles" | "inline";
};

const SECOND_MS = 1_000;

const split = (remainingMs: number) => {
  const total = Math.max(0, Math.floor(remainingMs / SECOND_MS));

  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3_600),
    minutes: Math.floor((total % 3_600) / 60),
    seconds: total % 60,
  };
};

const pad = (value: number) => String(value).padStart(2, "0");

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function CountdownSoundToggle({ hidden, label }: { hidden: boolean; label: string }) {
  const enabled = useSyncExternalStore(
    subscribeCountdownSound,
    getCountdownSoundEnabled,
    getServerCountdownSoundEnabled,
  );
  const Icon = enabled ? Volume2 : VolumeX;

  return (
    <CountdownSoundButton
      aria-label={label}
      aria-pressed={enabled}
      data-countdown-sound=""
      onClick={toggleCountdownSound}
      tabIndex={hidden ? -1 : undefined}
      title={label}
      type="button"
    >
      <Icon aria-hidden="true" size={14} strokeWidth={1.75} />
    </CountdownSoundButton>
  );
}

/**
 * One split-flap card. On a new value the old one is kept for the flaps; when the
 * lower flap has landed the card settles, the flaps go away and both halves show
 * the same number again, so a card at rest never mixes two values.
 */
function FlipDigits({ value }: { value: string }) {
  const [state, setState] = useState({ flips: 0, previous: value, value });

  // Adjusting state to a new prop during render (React's own pattern for it).
  if (state.value !== value) {
    setState({ flips: state.flips + 1, previous: state.value, value });
  }

  const isFlipping =
    state.previous !== state.value &&
    typeof window !== "undefined" &&
    !window.matchMedia(REDUCED_MOTION).matches;
  const settle = () => setState((current) => ({ ...current, previous: current.value }));

  return (
    <FlipCard>
      <FlipHalf $half="top">
        <span>{state.value}</span>
      </FlipHalf>
      <FlipHalf $half="bottom">
        <span>{isFlipping ? state.previous : state.value}</span>
      </FlipHalf>
      {isFlipping ? (
        <span key={state.flips}>
          <FlipHalf $flap $half="top">
            <span>{state.previous}</span>
          </FlipHalf>
          <FlipHalf $flap $half="bottom" onAnimationEnd={settle}>
            <span>{state.value}</span>
          </FlipHalf>
        </span>
      ) : null}
    </FlipCard>
  );
}

/**
 * Time left until the end of Black Friday. The digits have a fixed width, so the
 * ticking never moves the layout. At zero the page is refreshed once: the server
 * then renders it without the campaign and with the regular prices.
 */
const FINAL_HOURS_MS = 24 * 60 * 60 * 1000;

export default function BlackFridayCountdown({
  caption,
  endsAt,
  finalLabel,
  label,
  labels,
  serverNow,
  soundHidden = false,
  soundLabel,
  soundTargetId,
  variant,
}: BlackFridayCountdownProps) {
  const router = useRouter();
  const endsAtMs = Date.parse(endsAt);
  const [now, setNow] = useState(serverNow);
  const refreshed = useRef(false);
  const visibleSurface = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (soundHidden) return;
    const surface = document.getElementById(soundTargetId);
    if (!surface) return;

    const observer = new IntersectionObserver(([entry]) => {
      const { height, width } = entry.intersectionRect;
      visibleSurface.current =
        entry.isIntersecting && height > 0 && width > 0 ? surface : null;
    });
    observer.observe(surface);
    return () => {
      observer.disconnect();
      visibleSurface.current = null;
    };
  }, [soundHidden, soundTargetId]);

  useEffect(() => {
    let interval: number | undefined;
    const tick = () => {
      const at = Date.now();
      setNow(at);
      if (!soundHidden && at < endsAtMs && visibleSurface.current) {
        playCountdownTick(visibleSurface.current, at);
      }
    };
    // Line the ticks up with whole seconds of the real clock.
    const timeout = window.setTimeout(
      () => {
        tick();
        interval = window.setInterval(tick, SECOND_MS);
      },
      SECOND_MS - (Date.now() % SECOND_MS),
    );

    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [endsAtMs, soundHidden]);

  useEffect(() => {
    if (now >= endsAtMs && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [endsAtMs, now, router]);

  const { days, hours, minutes, seconds } = split(endsAtMs - now);
  const isFinal = endsAtMs - now < FINAL_HOURS_MS;
  // Screen readers get one sentence instead of four ticking numbers.
  const spoken = `${label}: ${days} ${labels.days} ${hours} ${labels.hours} ${minutes} ${labels.minutes}`;

  if (variant === "inline") {
    return (
      <>
        <CountdownInline role="timer" aria-label={spoken}>
          <span aria-hidden="true">
            {isFinal ? <FinalMark>{finalLabel}</FinalMark> : null}
            {days > 0 ? `${days}${labels.days} ` : ""}
            {pad(hours)}:{pad(minutes)}:{pad(seconds)}
          </span>
        </CountdownInline>
        <CountdownSoundToggle hidden={soundHidden} label={soundLabel} />
      </>
    );
  }

  const units = [
    [days, labels.days],
    [hours, labels.hours],
    [minutes, labels.minutes],
    [seconds, labels.seconds],
  ] as const;

  return (
    <>
      <CountdownHeading>
        {caption ? (
          <CountdownCaption data-final={isFinal || undefined}>
            {isFinal ? finalLabel : caption}
          </CountdownCaption>
        ) : null}
        <CountdownSoundToggle hidden={soundHidden} label={soundLabel} />
      </CountdownHeading>
      <CountdownTiles role="timer" aria-label={spoken} data-final={isFinal || undefined}>
        {units.map(([value, unit]) => (
          <CountdownTile key={unit} aria-hidden="true">
            <FlipDigits value={pad(value)} />
            <CountdownUnit>{unit}</CountdownUnit>
          </CountdownTile>
        ))}
      </CountdownTiles>
    </>
  );
}
