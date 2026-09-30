import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/infrastructure/config/env";

declare global {
  var __smsGatewayPrisma: PrismaClient | undefined;
  var __smsGatewayPgPool: Pool | undefined;
}

/**
 * Prisma 7's generated client has no bundled query-engine binary — it talks
 * to Postgres through an explicit driver adapter (@prisma/adapter-pg) over a
 * `pg` connection pool that we own and size ourselves.
 */
const pgPool: Pool =
  globalThis.__smsGatewayPgPool ??
  new Pool({
    connectionString: env.DATABASE_URL,
    max: env.NODE_ENV === "production" ? 20 : 5,
  });

/**
 * Singleton Prisma client. In dev, Next.js/Turbopack hot-reloads modules,
 * which would otherwise create a new PrismaClient (and a new connection pool)
 * on every edit — stash it on `globalThis` to survive reloads.
 */
export const prisma: PrismaClient =
  globalThis.__smsGatewayPrisma ??
  new PrismaClient({
    adapter: new PrismaPg(pgPool),
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (env.NODE_ENV !== "production") {
  globalThis.__smsGatewayPrisma = prisma;
  globalThis.__smsGatewayPgPool = pgPool;
}
