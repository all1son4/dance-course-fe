import type { PulseSignal } from "./system-pulse";

/** Pulse signals that need a person now, worded as overview attention items. */
export const URGENT_PULSE_SIGNALS = ["telegram", "fail-rate"] as const;

export const getUrgentPulseItems = (signals: PulseSignal[]) =>
  signals
    .filter(
      (signal) =>
        signal.tone === "danger" &&
        (URGENT_PULSE_SIGNALS as readonly string[]).includes(signal.id),
    )
    .map((signal) => ({
      id: `pulse-${signal.id}`,
      view: "operations" as const,
      severity: "danger" as const,
      title: `${signal.label}: ${signal.value.toLowerCase()}`,
      detail: signal.detail,
    }));
