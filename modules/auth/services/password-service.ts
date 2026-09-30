import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";
import type { HashOptions } from "argon2";

/**
 * argon2id, OWASP-recommended default parameters (19 MiB memory, 2 iterations,
 * 1 degree of parallelism is argon2's library default — we bump memory cost
 * slightly above the library default for better resistance to GPU cracking
 * while staying cheap enough for a single request on modest hardware).
 */
const HASH_OPTIONS: HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plainPassword: string): Promise<string> {
  return argon2.hash(plainPassword, HASH_OPTIONS);
}

export async function verifyPassword(hash: string, plainPassword: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plainPassword);
  } catch {
    // Malformed/foreign hash — treat as a failed verification, never throw into caller.
    return false;
  }
}

export function passwordNeedsRehash(hash: string): boolean {
  return argon2.needsRehash(hash, HASH_OPTIONS);
}

// No ambiguous-looking characters (0/O, 1/l/I) — this is read off a screen and typed
// in by hand once. Letter + digit are picked explicitly so the result always satisfies
// registerSchema's passwordSchema regardless of how the rest shakes out randomly.
const TEMP_PASSWORD_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const TEMP_PASSWORD_DIGITS = "23456789";
const TEMP_PASSWORD_LENGTH = 12;

function randomChar(charset: string): string {
  return charset[randomBytes(1)[0] % charset.length];
}

/** Generates a one-time password for accounts created on someone else's behalf (e.g. an org admin creating a team member) — shown once, never stored in plaintext. */
export function generateTemporaryPassword(): string {
  const pool = TEMP_PASSWORD_LETTERS + TEMP_PASSWORD_DIGITS;
  const chars = [randomChar(TEMP_PASSWORD_LETTERS), randomChar(TEMP_PASSWORD_DIGITS)];
  while (chars.length < TEMP_PASSWORD_LENGTH) chars.push(randomChar(pool));

  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
