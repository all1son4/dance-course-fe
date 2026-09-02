type DatabaseErrorLike = {
  cause?: unknown;
  code?: unknown;
  errno?: unknown;
};

type DatabaseReadRetryContext = {
  attempt: number;
  error: unknown;
  errorCode: string | null;
};

type DatabaseReadRetryOptions = {
  delayMs?: number;
  maxAttempts?: number;
  onRetry?: (context: DatabaseReadRetryContext) => void;
  sleep?: (delayMs: number) => Promise<void>;
};

const DEFAULT_DELAY_MS = 150;
const DEFAULT_MAX_ATTEMPTS = 2;
const MAX_ERROR_CAUSE_DEPTH = 8;

const TRANSIENT_CONNECTION_ERROR_CODES = new Set([
  "CONNECT_TIMEOUT",
  "CONNECTION_CLOSED",
  "CONNECTION_DESTROYED",
  "CONNECTION_ENDED",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENETDOWN",
  "ENETUNREACH",
  "EPIPE",
  "ETIMEDOUT",
]);

const TRANSIENT_POSTGRES_ERROR_CODES = new Set([
  "40001", // serialization_failure
  "53300", // too_many_connections
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
]);

const isErrorLike = (value: unknown): value is DatabaseErrorLike =>
  typeof value === "object" && value !== null;

const normalizeErrorCode = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim().toUpperCase() : null;

/** Finds the driver or SQLSTATE code through wrappers such as DrizzleQueryError. */
export const getDatabaseErrorCode = (error: unknown): string | null => {
  const seen = new Set<object>();
  let current: unknown = error;

  for (let depth = 0; depth < MAX_ERROR_CAUSE_DEPTH && isErrorLike(current); depth += 1) {
    if (seen.has(current)) {
      return null;
    }

    seen.add(current);
    const code = normalizeErrorCode(current.code) ?? normalizeErrorCode(current.errno);

    if (code) {
      return code;
    }

    current = current.cause;
  }

  return null;
};

export const isTransientDatabaseReadError = (error: unknown) => {
  const code = getDatabaseErrorCode(error);

  return Boolean(
    code &&
    (TRANSIENT_CONNECTION_ERROR_CODES.has(code) ||
      TRANSIENT_POSTGRES_ERROR_CODES.has(code) ||
      code.startsWith("08")),
  );
};

const defaultSleep = (delayMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });

/**
 * Retries read-only work once when the driver reports a transient connection
 * or PostgreSQL availability failure. Never use this around writes: their
 * outcome may be unknown after a broken connection.
 */
export const retryTransientDatabaseRead = async <T>(
  operation: () => Promise<T>,
  {
    delayMs = DEFAULT_DELAY_MS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    onRetry,
    sleep = defaultSleep,
  }: DatabaseReadRetryOptions = {},
): Promise<T> => {
  const attempts = Math.max(1, Math.floor(maxAttempts));

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= attempts || !isTransientDatabaseReadError(error)) {
        throw error;
      }

      onRetry?.({ attempt, error, errorCode: getDatabaseErrorCode(error) });
      await sleep(Math.max(0, delayMs) * attempt);
    }
  }

  throw new Error("Database read retry exhausted without a result");
};
