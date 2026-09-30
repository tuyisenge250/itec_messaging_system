import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/infrastructure/config/env";

/**
 * AES-256-GCM "encrypted at rest" helper for values the system must be able
 * to read back later (outbound webhook signing secrets, provider
 * credentials) — as opposed to session tokens or API key secrets, which are
 * only ever one-way hashed (see shared/utils/crypto.ts).
 *
 * The key is derived by hashing ENCRYPTION_KEY with SHA-256 so any
 * reasonably long secret string works as input, not just an exact 32-byte
 * base64 value.
 */
const KEY = createHash("sha256").update(env.ENCRYPTION_KEY).digest();
const IV_LENGTH = 12; // recommended for GCM

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptSecret(encoded: string): string {
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = raw.subarray(IV_LENGTH + 16);
  const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
