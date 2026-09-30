import pino from "pino";
import { env } from "@/infrastructure/config/env";

/**
 * Fields that must never be logged, even if accidentally present on a
 * metadata object passed to `.info(meta, msg)` etc. Pino's redact only
 * matches these paths at any depth via the wildcard below.
 */
const REDACTED_PATHS = [
  "password",
  "passwordHash",
  "secret",
  "secretHash",
  "token",
  "apiKey",
  "apiSecret",
  "authorization",
  "cookie",
  "sessionToken",
  "*.password",
  "*.passwordHash",
  "*.secret",
  "*.token",
  "*.apiKey",
  "*.apiSecret",
  "*.authorization",
  "*.cookie",
];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: { paths: REDACTED_PATHS, censor: "[REDACTED]" },
  base: { service: "sms-gateway" },
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
      : undefined,
});

export type Logger = typeof logger;

/** Child logger carrying request-scoped correlation fields. */
export function childLogger(fields: Record<string, unknown>): Logger {
  return logger.child(fields) as Logger;
}
