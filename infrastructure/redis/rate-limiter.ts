import { redis } from "./client";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
}

/**
 * Fixed-window counter backed by Redis INCR + EXPIRE NX. This is the "fast
 * path" rate limiter (login attempts, per-second provider throttling,
 * IP/API-key request limits) — approximate at window boundaries, which is an
 * acceptable tradeoff for abuse prevention. It is deliberately NOT the
 * permanent record of fraud history (see modules/fraud — FraudEvent rows in
 * Postgres are the durable record; this is just the trigger).
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  return checkRateLimitBy(key, 1, limit, windowSeconds);
}

/** Like checkRateLimit, but increments by `amount` in one call — for bulk operations (e.g. an N-recipient send counting as N against an SMS/minute quota). */
export async function checkRateLimitBy(
  key: string,
  amount: number,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const redisKey = `ratelimit:${key}`;
  const count = await redis.incrby(redisKey, amount);
  if (count === amount) {
    await redis.expire(redisKey, windowSeconds, "NX");
  }
  const ttl = await redis.ttl(redisKey);
  const resetAt = new Date(Date.now() + Math.max(ttl, 0) * 1000);

  return {
    allowed: count <= limit,
    remaining: Math.max(limit - count, 0),
    limit,
    resetAt,
  };
}

/** Reset a rate-limit counter early (e.g. on successful login, to clear failed-attempt counters). */
export async function resetRateLimit(key: string): Promise<void> {
  await redis.del(`ratelimit:${key}`);
}
