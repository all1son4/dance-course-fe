"use client";

import { useEffect, useRef, useState } from "react";

import { useRouter } from "@/i18n/navigation";

import {
  CountdownInline,
  CountdownTile,
  CountdownTiles,
  CountdownUnit,
  CountdownValue,
} from "./BlackFriday.styles";

export type CountdownLabels = {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
};

type BlackFridayCountdownProps = {
  /** ISO end of the campaign. */
  endsAt: string;
  /** The server's clock at render: the first client render shows the same digits. */
  serverNow: number;
  labels: CountdownLabels;
  /** Accessible sentence before the time, e.g. "Until the end of the offer". */
  label: string;
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

/**
 * Time left until the end of Black Friday. The digits have a fixed width, so the
 * ticking never moves the layout. At zero the page is refreshed once: the server
 * then renders it without the campaign and with the regular prices.
 */
export default function BlackFridayCountdown({
  endsAt,
  label,
  labels,
  serverNow,
  variant,
}: BlackFridayCountdownProps) {
  const router = useRouter();
  const endsAtMs = Date.parse(endsAt);
  const [now, setNow] = useState(serverNow);
  const refreshed = useRef(false);

  useEffect(() => {
    let interval: number | undefined;
    const tick = () => setNow(Date.now());
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
  }, []);

  useEffect(() => {
    if (now >= endsAtMs && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [endsAtMs, now, router]);

  const { days, hours, minutes, seconds } = split(endsAtMs - now);
  // Screen readers get one sentence instead of four ticking numbers.
  const spoken = `${label}: ${days} ${labels.days} ${hours} ${labels.hours} ${minutes} ${labels.minutes}`;

  if (variant === "inline") {
    return (
      <CountdownInline role="timer" aria-label={spoken}>
        <span aria-hidden="true">
          {days > 0 ? `${days}${labels.days} ` : ""}
          {pad(hours)}:{pad(minutes)}:{pad(seconds)}
        </span>
      </CountdownInline>
    );
  }

  const units = [
    [days, labels.days],
    [hours, labels.hours],
    [minutes, labels.minutes],
    [seconds, labels.seconds],
  ] as const;

  return (
    <CountdownTiles role="timer" aria-label={spoken}>
      {units.map(([value, unit]) => (
        <CountdownTile key={unit} aria-hidden="true">
          <CountdownValue>{pad(value)}</CountdownValue>
          <CountdownUnit>{unit}</CountdownUnit>
        </CountdownTile>
      ))}
    </CountdownTiles>
  );
}
