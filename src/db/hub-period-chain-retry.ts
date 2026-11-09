import timers from "node:timers/promises";

import { getDatabaseErrorCode } from "./database-read-retry";

const RETRYABLE_DATABASE_CODES: readonly string[] = ["40001", "40P01"];
const RETRYABLE_CONFLICT_MESSAGES: readonly string[] = [
  "hub_period_chain_read_conflict",
  "hub_period_chain_write_conflict",
];
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 100;

export function isRetryableHubPeriodChainError(error: unknown): boolean {
  const codeResult = getDatabaseErrorCode(error);

  if (codeResult !== null) {
    return RETRYABLE_DATABASE_CODES.includes(codeResult);
  }

  if (error instanceof Error) {
    return RETRYABLE_CONFLICT_MESSAGES.includes(error.message);
  }

  return false;
}

/** Each callback invocation must represent a complete transaction attempt. */
export async function retryHubPeriodChainTransaction<Result>(
  runAttempt: () => Promise<Result>,
): Promise<Result> {
  let counter = 1;

  while (true) {
    try {
      return await runAttempt();
    } catch (error) {
      if (!isRetryableHubPeriodChainError(error) || counter >= MAX_ATTEMPTS) {
        throw error;
      }

      await timers.setTimeout(BASE_DELAY_MS * counter);
      counter++;
    }
  }
}
