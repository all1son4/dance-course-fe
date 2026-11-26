import { after } from "next/server";

import {
  describeDatabaseConnections,
  isDatabaseConnectionFailureCode,
} from "@/db/connection-watch";
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

/**
 * A failure to connect to the database carries the driver's state at that moment
 * in place of a reference, so the next one can be judged from the log alone.
 */
export const withConnectionFacts = (
  input: OperationalEventSinkInput,
): OperationalEventSinkInput =>
  input.reference === null && isDatabaseConnectionFailureCode(input.code)
    ? { ...input, reference: describeDatabaseConnections() }
    : input;

export const recordAfterResponse = (event: OperationalEventSinkInput) => {
  // Read now: after the response the pool has already moved on.
  const input = withConnectionFacts(event);
  try {
    after(() => writeOperationalEvent(input));
  } catch {
    // Outside a request scope (a build, a background task): write right away.
    void writeOperationalEvent(input);
  }
};
