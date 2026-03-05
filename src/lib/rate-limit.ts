type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type ConsumeRateLimitParams = {
  key: string;
  limit: number;
  windowMs: number;
};

type ConsumeRateLimitResult = {
  limited: boolean;
  retryAfterSeconds: number;
};

const buckets = new Map<string, RateLimitBucket>();
const MAX_BUCKETS_BEFORE_SWEEP = 5000;

const getNow = () => Date.now();

const getRetryAfterSeconds = (resetAt: number) =>
  Math.max(Math.ceil((resetAt - getNow()) / 1000), 1);

export const getRequestIp = (request: Request) => {
  const forwardedFor = request.headers.get("x-forwarded-for")?.trim() ?? "";

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  const realIp = request.headers.get("x-real-ip")?.trim() ?? "";

  return realIp || "unknown";
};

export const consumeRateLimit = ({
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
    };
  }

  if (currentBucket.count >= limit) {
    return {
      limited: true,
      retryAfterSeconds: getRetryAfterSeconds(currentBucket.resetAt),
    };
  }

  currentBucket.count += 1;

  return {
    limited: false,
    retryAfterSeconds: getRetryAfterSeconds(currentBucket.resetAt),
  };
};
