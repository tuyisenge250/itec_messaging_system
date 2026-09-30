import { prisma } from "@/infrastructure/database/prisma";
import { redis } from "@/infrastructure/redis/client";
import { getQueueStats, type QueueStats } from "./queue-service";
import { requirePlatformAdmin } from "@/modules/auth/services/authorization-service";
import type { ActorContext } from "@/shared/types/actor-context";

type CheckStatus = "HEALTHY" | "DEGRADED" | "DOWN";

async function timed<T>(fn: () => Promise<T>): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    await fn();
    return { ok: true, latencyMs: Date.now() - start };
  } catch (error) {
    return { ok: false, latencyMs: Date.now() - start, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Orchestrates the individual health checks — each wrapped so one failing
 * dependency (e.g. Redis down) never prevents reporting on the others.
 */
export async function getSystemHealth(actor: ActorContext) {
  requirePlatformAdmin(actor);

  const [postgres, redisCheck] = await Promise.all([
    timed(() => prisma.$queryRaw`SELECT 1`),
    timed(() => redis.ping()),
  ]);

  let queueStats: QueueStats[] = [];
  let queuesError: string | undefined;
  try {
    queueStats = await getQueueStats(actor);
  } catch (error) {
    queuesError = error instanceof Error ? error.message : String(error);
  }

  const queues = queueStats.map((q) => ({
    ...q,
    status: (q.failed > 0 ? "DEGRADED" : "HEALTHY") as CheckStatus,
  }));

  return {
    postgres: { status: (postgres.ok ? "HEALTHY" : "DOWN") as CheckStatus, latencyMs: postgres.latencyMs, error: postgres.error },
    redis: { status: (redisCheck.ok ? "HEALTHY" : "DOWN") as CheckStatus, latencyMs: redisCheck.latencyMs, error: redisCheck.error },
    queues,
    queuesError,
  };
}
