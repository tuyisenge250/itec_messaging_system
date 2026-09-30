import { z } from "zod";

/**
 * Validated process environment. Import `env` anywhere instead of touching
 * `process.env` directly — this is the only file allowed to read raw env vars
 * (aside from Next.js's own NEXT_PUBLIC_* client bundling, which we don't use here).
 *
 * Fails fast (throws at import time) if required variables are missing or malformed,
 * per AGENTS/architecture requirement #46 ("Use Zod to validate environment variables
 * at startup").
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_NAME: z.string().default("SMS Gateway"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_DATABASE_URL: z.string().min(1).optional(),

  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters"),
  // AES-256-GCM key for encrypting-at-rest values that must be decryptable later
  // (outbound webhook signing secrets, provider credentials) — as opposed to
  // session/API-key tokens, which are only ever hashed. 32 raw bytes,
  // base64-encoded. Generate with: openssl rand -base64 32
  ENCRYPTION_KEY: z.string().min(16, "ENCRYPTION_KEY must be at least 16 characters"),
  SESSION_COOKIE_NAME: z.string().default("sms_gateway_session"),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(2592000),

  STORAGE_PROVIDER: z.enum(["local", "cloudinary"]).default("local"),
  LOCAL_STORAGE_PATH: z.string().default(".local-storage"),
  MAX_UPLOAD_SIZE_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),

  SMS_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
  SMS_PROVIDER: z.enum(["simulator", "mtn", "airtel"]).default("simulator"),

  PAYMENT_PROVIDER: z.enum(["simulator", "real"]).default("simulator"),

  WEBHOOK_SIGNING_SECRET: z.string().min(8),
  SIMULATOR_WEBHOOK_SECRET: z.string().min(8),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  // Optional — server-side error tracking (see infrastructure/observability/sentry.ts).
  // Unset means fully disabled/no-op, same config-driven-optional convention as
  // STORAGE_PROVIDER's "cloudinary not implemented yet" branch.
  SENTRY_DSN: z.string().url().optional(),

  WORKER_CONCURRENCY_SMS_SEND: z.coerce.number().int().positive().default(5),
  WORKER_CONCURRENCY_SMS_DELIVERY: z.coerce.number().int().positive().default(10),

  // --- Sandbox onboarding (see modules/organizations/onboarding-service.ts) ---
  SANDBOX_ENABLED: z.coerce.boolean().default(true),
  // In this project's money model 1 minor unit = 1 RWF (see docs/architecture.md), so
  // this is directly a RWF amount — default matches the documented "10,000 RWF" starting balance.
  SANDBOX_INITIAL_CREDIT_MINOR_UNITS: z.coerce.number().int().nonnegative().default(10_000),
  SANDBOX_DEFAULT_DELIVERY_DELAY_MS: z.coerce.number().int().nonnegative().default(3000),
  // Digits-only local prefix (no leading +250) a phone number must start with, after
  // normalization, to be treated as a sandbox-only virtual test number — see
  // shared/utils/phone.ts. Deliberately NOT a real Rwandan mobile prefix (72/73/75/78/79)
  // so these numbers can never collide with a real subscriber.
  SANDBOX_TEST_NUMBER_PREFIX: z.string().default("700000"),
  SANDBOX_DEFAULT_SENDER_PREFIX: z.string().default("TEST"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }
  return parsed.data;
}

export const env = loadEnv();
