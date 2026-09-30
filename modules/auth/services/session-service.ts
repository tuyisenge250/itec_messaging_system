import { cookies } from "next/headers";
import { authRepository } from "../repository";
import { generateRandomToken, sha256Hex } from "@/shared/utils/crypto";
import { CSRF_COOKIE_NAME, generateCsrfToken } from "@/shared/http/csrf";
import { env } from "@/infrastructure/config/env";
import { AppError } from "@/shared/errors/app-error";
import type { User } from "@/generated/prisma/client";

export interface CreatedSession {
  token: string;
  expiresAt: Date;
}

export async function createSession(
  userId: string,
  meta: { ipAddress?: string | null; userAgent?: string | null },
): Promise<CreatedSession> {
  const token = generateRandomToken(32);
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_SECONDS * 1000);

  await authRepository.createSession({
    userId,
    tokenHash,
    expiresAt,
    ipAddress: meta.ipAddress ?? null,
    userAgent: meta.userAgent ?? null,
  });

  return { token, expiresAt };
}

export interface SessionValidationResult {
  user: User;
  sessionId: string;
}

/** Looks up and validates a raw session token (expiry + revocation). Does not touch cookies. */
export async function validateSessionToken(token: string): Promise<SessionValidationResult | null> {
  if (!token) return null;
  const tokenHash = sha256Hex(token);
  const session = await authRepository.findSessionByTokenHash(tokenHash);
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;
  if (session.user.status !== "ACTIVE") return null;

  return { user: session.user, sessionId: session.id };
}

export async function revokeSessionByToken(token: string): Promise<void> {
  await authRepository.revokeSession(sha256Hex(token));
}

export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await authRepository.revokeAllUserSessions(userId);
}

export interface SessionSummary {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  expiresAt: Date;
  isCurrent: boolean;
}

/** Lists a user's own active sessions — never exposes tokenHash. */
export async function listSessionsForUser(userId: string, currentToken?: string): Promise<SessionSummary[]> {
  const currentHash = currentToken ? sha256Hex(currentToken) : undefined;
  const sessions = await authRepository.listActiveSessionsForUser(userId);
  return sessions.map((s) => ({
    id: s.id,
    userAgent: s.userAgent,
    ipAddress: s.ipAddress,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    isCurrent: s.tokenHash === currentHash,
  }));
}

/** Revokes one specific session by id — only if it belongs to the requesting user. */
export async function revokeSessionById(userId: string, sessionId: string): Promise<void> {
  const session = await authRepository.findSessionById(sessionId);
  if (!session || session.userId !== userId) {
    throw AppError.notFound("Session not found");
  }
  await authRepository.revokeSessionById(sessionId);
}

// --- Cookie plumbing (must be called from a route handler / server action request scope) ---

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(env.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  // Readable by client JS (not httpOnly) — the double-submit CSRF pattern
  // depends on same-origin JS being able to read this and echo it back as a
  // header; see shared/http/csrf.ts.
  store.set(CSRF_COOKIE_NAME, generateCsrfToken(), {
    httpOnly: false,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function getSessionCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(env.SESSION_COOKIE_NAME)?.value;
}

export async function getCsrfCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(CSRF_COOKIE_NAME)?.value;
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(env.SESSION_COOKIE_NAME);
  store.delete(CSRF_COOKIE_NAME);
}
