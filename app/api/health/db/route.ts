import { NextResponse } from "next/server";
import { prisma } from "@/infrastructure/database/prisma";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", service: "postgres" });
  } catch (error) {
    logger.error({ err: error }, "health check: postgres unavailable");
    // Never echo the raw driver error (can include connection details) to an unauthenticated caller.
    return NextResponse.json({ status: "error", service: "postgres", message: "Database unavailable" }, { status: 503 });
  }
}
