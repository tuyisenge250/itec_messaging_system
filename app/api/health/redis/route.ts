import { NextResponse } from "next/server";
import { redis } from "@/infrastructure/redis/client";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export async function GET() {
  try {
    const pong = await redis.ping();
    return NextResponse.json({ status: pong === "PONG" ? "ok" : "degraded", service: "redis" });
  } catch (error) {
    logger.error({ err: error }, "health check: redis unavailable");
    // Never echo the raw driver error (can include connection details) to an unauthenticated caller.
    return NextResponse.json({ status: "error", service: "redis", message: "Redis unavailable" }, { status: 503 });
  }
}
