/**
 * Pure helpers for sandbox onboarding — deliberately free of any database
 * import. modules/organizations/onboarding-service.ts uses this at request
 * time; prisma/seed.ts uses it too, and seed.ts must NOT import anything
 * that pulls in infrastructure/database/prisma.ts (that module instantiates
 * its own singleton pg.Pool as a side effect of import, which would leak a
 * second, never-closed connection pool alongside the seed script's own).
 */
import { env } from "@/infrastructure/config/env";

/** Real GSM alphanumeric sender ID length cap — see modules/sender-ids/validation.ts. */
const MAX_SENDER_ID_LENGTH = 11;

/**
 * Deterministic so re-running onboarding for the same organization always
 * proposes the same value — callers make the actual creation idempotent via
 * a find-before-create check against the (organizationId, value, environment)
 * unique constraint on SenderId.
 */
export function generateSandboxSenderIdValue(legalName: string): string {
  const prefix = env.SANDBOX_DEFAULT_SENDER_PREFIX.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const shortCode = legalName.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const separator = "_";
  const available = MAX_SENDER_ID_LENGTH - prefix.length - separator.length;

  if (available <= 0) return prefix.slice(0, MAX_SENDER_ID_LENGTH) || "TEST";
  const code = (shortCode || "ORG").slice(0, available);
  return `${prefix}${separator}${code}`;
}

/** e.g. "700000" + "008" -> national "700000008" -> "+250700000008". Matches shared/utils/phone.ts's sandbox-number allowance. */
export function sandboxTestNumber(suffix: string): string {
  return `+250${env.SANDBOX_TEST_NUMBER_PREFIX}${suffix}`;
}
