import { after } from "next/server";

import { recordOperationalEvent } from "@/db/operational-events";
import type { OperationalEventSinkInput } from "@/lib/safe-error-log";

import { getSafeErrorCategory } from "./error-code";

/** Writes one event after the response, so the log never slows or breaks a request. */
export const writeOperationalEvent = async (input: OperationalEventSinkInput) => {
  try {
    await recordOperationalEvent(input);
  } catch (error) {
    // The console keeps the line; the log must never fail its caller.
    console.error("Failed to record an operational event", {
      errorCategory: getSafeErrorCategory(error),
    });
  }
};

export const recordAfterResponse = (input: OperationalEventSinkInput) => {
  try {
    after(() => writeOperationalEvent(input));
  } catch {
    // Outside a request scope (a build, a background task): write right away.
    void writeOperationalEvent(input);
  }
};
