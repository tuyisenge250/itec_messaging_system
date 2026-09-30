import { env } from "@/infrastructure/config/env";

/**
 * Rwanda-focused MSISDN normalization. Accepts common local input formats and
 * normalizes to E.164 (+250XXXXXXXXX). This is intentionally Rwanda-specific
 * per the product brief; a multi-country gateway would generalize this with
 * a library like libphonenumber, but that's out of scope here.
 */

const RWANDA_COUNTRY_CODE = "250";
// MTN: 078/079, Airtel: 072/073, historically 075 also allocated.
const VALID_MOBILE_PREFIXES = ["78", "79", "72", "73", "75"];

export interface PhoneNormalizationResult {
  valid: boolean;
  e164?: string;
  reason?: string;
}

function extractNational(raw: string): string | null {
  const digitsOnly = raw.replace(/[\s\-()]/g, "").replace(/^\+/, "");

  if (digitsOnly.startsWith(RWANDA_COUNTRY_CODE) && digitsOnly.length === 12) {
    return digitsOnly.slice(3);
  }
  if (digitsOnly.startsWith("0") && digitsOnly.length === 10) {
    return digitsOnly.slice(1);
  }
  if (digitsOnly.length === 9) {
    return digitsOnly;
  }
  return null;
}

/**
 * True if `national` (9-digit, no country code) falls in the configured
 * sandbox virtual test-number range (SANDBOX_TEST_NUMBER_PREFIX, default
 * "700000" — the "70" block is not a real Rwandan mobile prefix, so these
 * numbers can never collide with, or accidentally reach, a real subscriber).
 */
function isSandboxTestNational(national: string): boolean {
  return national.startsWith(env.SANDBOX_TEST_NUMBER_PREFIX);
}

/**
 * `environment` gates the sandbox virtual-number allowance — the guard lives
 * here, at the single normalization call site every send path already goes
 * through (modules/messaging/service.ts), rather than scattered as
 * `if (environment === "sandbox")` checks elsewhere. In PRODUCTION only real
 * MTN/Airtel prefixes validate, exactly as before.
 */
export function normalizeRwandaPhoneNumber(raw: string, environment: "SANDBOX" | "PRODUCTION" = "PRODUCTION"): PhoneNormalizationResult {
  if (!raw || typeof raw !== "string") {
    return { valid: false, reason: "Phone number is required" };
  }

  const national = extractNational(raw);
  if (!national || !/^\d{9}$/.test(national)) {
    return { valid: false, reason: "Phone number must be a valid Rwandan MSISDN" };
  }

  if (environment === "SANDBOX" && isSandboxTestNational(national)) {
    return { valid: true, e164: `+${RWANDA_COUNTRY_CODE}${national}` };
  }

  const prefix = national.slice(0, 2);
  if (!VALID_MOBILE_PREFIXES.includes(prefix)) {
    return {
      valid: false,
      reason:
        environment === "SANDBOX"
          ? `Unrecognized mobile prefix: ${prefix}. Use a real Rwandan prefix or a sandbox test number (+250${env.SANDBOX_TEST_NUMBER_PREFIX}XXX).`
          : `Unrecognized Rwandan mobile prefix: ${prefix}`,
    };
  }

  return { valid: true, e164: `+${RWANDA_COUNTRY_CODE}${national}` };
}

export function isValidRwandaPhoneNumber(raw: string, environment: "SANDBOX" | "PRODUCTION" = "PRODUCTION"): boolean {
  return normalizeRwandaPhoneNumber(raw, environment).valid;
}
