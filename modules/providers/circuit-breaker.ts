import { redis } from "@/infrastructure/redis/client";

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

/**
 * Redis-backed circuit breaker, shared across every worker process for a
 * given provider key (not per-instance state) — see
 * docs/architecture.md "Provider circuit breaker". CLOSED -> repeated
 * failures -> OPEN -> cooldown elapses -> HALF_OPEN (next attempt is a
 * probe) -> success closes it again, failure re-opens it.
 */
function keys(providerKey: string) {
  return {
    state: `circuit:${providerKey}:state`,
    failures: `circuit:${providerKey}:failures`,
    openedUntil: `circuit:${providerKey}:opened_until`,
  };
}

export async function canAttempt(providerKey: string): Promise<boolean> {
  const k = keys(providerKey);
  const state = (await redis.get(k.state)) as CircuitState | null;
  if (!state || state === "CLOSED" || state === "HALF_OPEN") return true;

  const openedUntil = Number((await redis.get(k.openedUntil)) ?? 0);
  if (Date.now() >= openedUntil) {
    // Cooldown elapsed — allow exactly one probe through in HALF_OPEN.
    await redis.set(k.state, "HALF_OPEN" satisfies CircuitState);
    return true;
  }
  return false;
}

export async function recordSuccess(providerKey: string): Promise<void> {
  const k = keys(providerKey);
  await redis.set(k.state, "CLOSED" satisfies CircuitState);
  await redis.del(k.failures);
}

export async function recordFailure(
  providerKey: string,
  failureThreshold: number,
  cooldownMs: number,
): Promise<void> {
  const k = keys(providerKey);
  const failures = await redis.incr(k.failures);
  await redis.expire(k.failures, 600);

  if (failures >= failureThreshold) {
    await redis.set(k.state, "OPEN" satisfies CircuitState);
    await redis.set(k.openedUntil, String(Date.now() + cooldownMs));
  }
}

export async function getCircuitState(providerKey: string): Promise<CircuitState> {
  const state = (await redis.get(keys(providerKey).state)) as CircuitState | null;
  return state ?? "CLOSED";
}
