import * as Sentry from "@sentry/node";
import { env } from "@/infrastructure/config/env";
import { logger } from "@/infrastructure/logging/logger";

let initialized = false;

/**
 * Config-driven, entirely optional — same pattern as STORAGE_PROVIDER in
 * infrastructure/storage/index.ts. With no SENTRY_DSN set, every export here
 * is a no-op; nothing about the app's behavior changes. Called once at
 * process start from instrumentation.ts (the Next.js server) and from
 * workers/main.ts (the standalone worker process) — both server-side only,
 * no client/browser Sentry, no build-plugin/source-map wiring.
 */
export function initSentry(): void {
  if (!env.SENTRY_DSN || initialized) return;
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV, tracesSampleRate: 0.1 });
  initialized = true;
  logger.info("Sentry error tracking initialized");
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
