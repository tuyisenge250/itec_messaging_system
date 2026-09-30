import Redis from "ioredis";
import { env } from "@/infrastructure/config/env";

declare global {
  var __smsGatewayRedis: Redis | undefined;
}

/**
 * Singleton ioredis connection, reused across hot reloads in dev the same way
 * we do for Prisma. BullMQ requires `maxRetriesPerRequest: null` on the
 * connection it's given (https://docs.bullmq.io/guide/going-to-production).
 */
function createRedisClient(): Redis {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}

export const redis: Redis = globalThis.__smsGatewayRedis ?? createRedisClient();

if (env.NODE_ENV !== "production") {
  globalThis.__smsGatewayRedis = redis;
}

/** Dedicated connection factory for BullMQ Queue/Worker instances (they must not share a connection used for blocking commands). */
export function createBullMqConnection(): Redis {
  return createRedisClient();
}
