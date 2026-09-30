import { randomBytes, createHash, createHmac, timingSafeEqual } from "node:crypto";

/** URL-safe random token, e.g. for session tokens, verification tokens, API key secrets. */
export function generateRandomToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

/**
 * One-way fingerprint for values we need to look up by exact match later
 * (session tokens, API key secrets, password-reset/verification tokens).
 * SHA-256 is fine here because the *input* already has 256 bits of entropy
 * from generateRandomToken — this is not a password hash (see modules/auth
 * password-service.ts, which uses argon2id for actual user passwords).
 */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Constant-time string comparison, for verifying signatures/tokens. */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
