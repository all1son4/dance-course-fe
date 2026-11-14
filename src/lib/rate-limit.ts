import { createHmac } from "node:crypto";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type ConsumeRateLimitParams = {
  key: string;
  limit: number;
  windowMs: number;
  onBackendUnavailable?: "local" | "deny";
};

type ConsumeRequestRateLimitParams = Omit<ConsumeRateLimitParams, "key"> & {
  keyPrefix: string;
  request: Request;
};

type ConsumeRateLimitResult = {
  limited: boolean;
  retryAfterSeconds: number;
  backendUnavailable: boolean;
};

type UpstashConfig = {
  prefix: string;
  token: string;
  url: string;
};

const buckets = new Map<string, RateLimitBucket>();
const MAX_BUCKETS_BEFORE_SWEEP = 5000;
const UPSTASH_TIMEOUT_MS = 2_000;
const UPSTASH_DEFAULT_PREFIX = "rate-limit";
const UPSTASH_RATE_LIMIT_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
local limited = 0
if current > tonumber(ARGV[2]) then
  limited = 1
end
return {limited, ttl}
`;

let lastUpstashErrorLogAt = 0;

const getNow = () => Date.now();

const getRetryAfterSeconds = (resetAt: number) =>
  Math.max(Math.ceil((resetAt - getNow()) / 1000), 1);

const getRetryAfterSecondsFromTtl = (ttlMs: number, fallbackWindowMs: number) =>
  Math.max(Math.ceil((ttlMs > 0 ? ttlMs : fallbackWindowMs) / 1000), 1);

const consumeLocalRateLimit = ({
  key,
  limit,
  windowMs,
}: ConsumeRateLimitParams): ConsumeRateLimitResult => {
  const now = getNow();

  if (buckets.size > MAX_BUCKETS_BEFORE_SWEEP) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) {
        buckets.delete(bucketKey);
      }
    }
  }

  const currentBucket = buckets.get(key);

  if (!currentBucket || currentBucket.resetAt <= now) {
    const resetAt = now + windowMs;

    buckets.set(key, {
      count: 1,
      resetAt,
    });

    return {
      limited: false,
      retryAfterSeconds: getRetryAfterSeconds(resetAt),
      backendUnavailable: false,
    };
  }

  if (currentBucket.count >= limit) {
    return {
      limited: true,
      retryAfterSeconds: getRetryAfterSeconds(currentBucket.resetAt),
      backendUnavailable: false,
    };
  }

  currentBucket.count += 1;

  return {
    limited: false,
    retryAfterSeconds: getRetryAfterSeconds(currentBucket.resetAt),
    backendUnavailable: false,
  };
};

const getUpstashConfig = (): UpstashConfig | null => {
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? "").trim().replace(/\/+$/u, "");
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? "").trim();

  if (!url || !token) {
    return null;
  }

  const prefix =
    (process.env.UPSTASH_RATE_LIMIT_PREFIX ?? "").trim() || UPSTASH_DEFAULT_PREFIX;

  return {
    prefix,
    token,
    url,
  };
};

const toNumber = (value: unknown) => {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
};

const parseUpstashScriptResult = (payload: unknown) => {
  const pipelineResults = Array.isArray(payload)
    ? payload
    : payload &&
        typeof payload === "object" &&
        Array.isArray((payload as { result?: unknown }).result)
      ? ((payload as { result: unknown[] }).result ?? [])
      : [];

  if (pipelineResults.length === 0) {
    throw new Error("upstash_empty_response");
  }

  const commandResult = pipelineResults[0];
  const commandPayload =
    commandResult && typeof commandResult === "object" && !Array.isArray(commandResult)
      ? (commandResult as { error?: string; result?: unknown })
      : null;

  if (commandPayload?.error) {
    throw new Error("upstash_command_failed");
  }

  const scriptResult = Array.isArray(commandResult)
    ? commandResult
    : commandPayload?.result;

  if (!Array.isArray(scriptResult) || scriptResult.length < 2) {
    throw new Error("upstash_invalid_script_result");
  }

  const limited = toNumber(scriptResult[0]);
  const ttlMs = toNumber(scriptResult[1]);

  if ((limited !== 0 && limited !== 1) || ttlMs === null) {
    throw new Error("upstash_invalid_rate_limit_result");
  }

  return {
    limited: limited === 1,
    ttlMs,
  };
};

const consumeDistributedRateLimit = async (
  params: ConsumeRateLimitParams,
  config: UpstashConfig,
): Promise<ConsumeRateLimitResult> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, UPSTASH_TIMEOUT_MS);

  try {
    // Keep the client's IP and other request identifiers out of Redis keys.
    const opaqueKey = createHmac("sha256", config.token).update(params.key).digest("hex");
    const redisKey = `${config.prefix}:${opaqueKey}`;
    const response = await fetch(`${config.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        [
          "EVAL",
          UPSTASH_RATE_LIMIT_SCRIPT,
          1,
          redisKey,
          String(params.windowMs),
          String(params.limit),
        ],
      ]),
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      throw new Error(`upstash_http_error:${response.status}`);
    }

    const { limited, ttlMs } = parseUpstashScriptResult(payload);

    return {
      limited,
      retryAfterSeconds: getRetryAfterSecondsFromTtl(ttlMs, params.windowMs),
      backendUnavailable: false,
    };
  } finally {
    clearTimeout(timeoutId);
  }
};

const logUpstashFailure = () => {
  const now = getNow();

  if (now - lastUpstashErrorLogAt < 60_000) {
    return;
  }

  lastUpstashErrorLogAt = now;
  // Provider errors may include URLs, tokens or request details.
  console.error("Upstash rate limit backend unavailable.");
};

const backendUnavailableResult = (): ConsumeRateLimitResult => ({
  limited: false,
  retryAfterSeconds: 0,
  backendUnavailable: true,
});

const shouldDenyOnBackendFailure = (params: ConsumeRateLimitParams) =>
  params.onBackendUnavailable === "deny" &&
  process.env.UPSTASH_RATE_LIMIT_ENFORCE_ADMIN === "1";

export const getRequestIp = (request: Request) => {
  const forwardedFor = request.headers.get("x-forwarded-for")?.trim() ?? "";

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  const realIp = request.headers.get("x-real-ip")?.trim() ?? "";

  return realIp || "unknown";
};

export const consumeRateLimit = async (
  params: ConsumeRateLimitParams,
): Promise<ConsumeRateLimitResult> => {
  const upstashConfig = getUpstashConfig();

  if (!upstashConfig) {
    return shouldDenyOnBackendFailure(params)
      ? backendUnavailableResult()
      : consumeLocalRateLimit(params);
  }

  try {
    return await consumeDistributedRateLimit(params, upstashConfig);
  } catch {
    logUpstashFailure();

    return shouldDenyOnBackendFailure(params)
      ? backendUnavailableResult()
      : consumeLocalRateLimit(params);
  }
};

export const consumeRequestRateLimit = ({
  keyPrefix,
  limit,
  onBackendUnavailable,
  request,
  windowMs,
}: ConsumeRequestRateLimitParams) =>
  consumeRateLimit({
    key: `${keyPrefix}:${getRequestIp(request)}`,
    limit,
    onBackendUnavailable,
    windowMs,
  });
