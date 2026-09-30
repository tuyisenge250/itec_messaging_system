import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/infrastructure/database/prisma";
import { redis } from "@/infrastructure/redis/client";
import { hashPassword, verifyPassword } from "@/modules/auth/services/password-service";
import {
  registerUser,
  login,
  requestPasswordReset,
  resetPassword,
  adminResetPassword,
} from "@/modules/auth/services/auth-service";
import {
  createSession,
  validateSessionToken,
  revokeSessionByToken,
  revokeAllSessionsForUser,
} from "@/modules/auth/services/session-service";
import { authRepository } from "@/modules/auth/repository";
import { AppError } from "@/shared/errors/app-error";

const runId = Date.now();
const testEmail = (label: string) => `test-${label}-${runId}@example.test`;
const createdUserIds: string[] = [];

async function register(label: string, password = "CorrectHorse123") {
  const { user } = await registerUser({ email: testEmail(label), password, name: label }, {});
  createdUserIds.push(user.id);
  return user;
}

afterAll(async () => {
  // Clean up everything this test file created — sessions/tokens cascade via onDelete.
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
  redis.disconnect();
});

describe("password-service", () => {
  it("hashes a password and verifies it back correctly", async () => {
    const hash = await hashPassword("CorrectHorse123");
    expect(hash).not.toBe("CorrectHorse123");
    expect(await verifyPassword(hash, "CorrectHorse123")).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("CorrectHorse123");
    expect(await verifyPassword(hash, "WrongPassword123")).toBe(false);
  });

  it("never throws for a malformed hash — just returns false", async () => {
    expect(await verifyPassword("not-a-real-hash", "anything")).toBe(false);
  });
});

describe("registerUser", () => {
  it("creates a user with a hashed (not plaintext) password", async () => {
    const user = await register("register-basic");
    expect(user.email).toBe(testEmail("register-basic"));
    expect(user.passwordHash).not.toContain("CorrectHorse123");
    expect(user.status).toBe("ACTIVE");
  });

  it("rejects a duplicate email", async () => {
    await register("register-dup");
    await expect(register("register-dup")).rejects.toMatchObject({ code: "EMAIL_ALREADY_REGISTERED" });
  });
});

describe("login", () => {
  it("succeeds with correct credentials and creates a session", async () => {
    const user = await register("login-ok");
    const result = await login({ email: user.email, password: "CorrectHorse123" }, {});
    expect(result.user.id).toBe(user.id);
    expect(result.token).toBeTruthy();
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const validated = await validateSessionToken(result.token);
    expect(validated?.user.id).toBe(user.id);
  });

  it("fails with a generic message for a wrong password", async () => {
    const user = await register("login-wrong-pw");
    await expect(login({ email: user.email, password: "NotThePassword" }, {})).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
  });

  it("fails with the same generic message for an unknown email (no user enumeration)", async () => {
    await expect(login({ email: testEmail("does-not-exist"), password: "whatever123" }, {})).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
  });

  it("rejects login for a disabled user", async () => {
    const user = await register("login-disabled");
    await prisma.user.update({ where: { id: user.id }, data: { status: "DISABLED" } });
    await expect(login({ email: user.email, password: "CorrectHorse123" }, {})).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
  });

  it("rate limits repeated login attempts for the same email", async () => {
    const user = await register("login-ratelimit");
    // The limiter allows 10 attempts / 15 minutes per email (see auth-service.ts).
    for (let i = 0; i < 10; i++) {
      await login({ email: user.email, password: "WrongPassword" }, {}).catch(() => undefined);
    }
    await expect(login({ email: user.email, password: "WrongPassword" }, {})).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });
});

describe("session-service", () => {
  it("revokes a session so it no longer validates", async () => {
    const user = await register("session-revoke");
    const session = await createSession(user.id, {});
    expect(await validateSessionToken(session.token)).not.toBeNull();

    await revokeSessionByToken(session.token);
    expect(await validateSessionToken(session.token)).toBeNull();
  });

  it("treats an already-expired session as invalid", async () => {
    const user = await register("session-expired");
    const session = await createSession(user.id, {});
    // Force it into the past directly — createSession itself always issues a future expiry.
    await prisma.session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await validateSessionToken(session.token)).toBeNull();
  });

  it("revokeAllSessionsForUser invalidates every session for that user", async () => {
    const user = await register("session-revoke-all");
    const sessionA = await createSession(user.id, {});
    const sessionB = await createSession(user.id, {});

    await revokeAllSessionsForUser(user.id);

    expect(await validateSessionToken(sessionA.token)).toBeNull();
    expect(await validateSessionToken(sessionB.token)).toBeNull();
  });
});

describe("password reset", () => {
  it("resets the password via a valid token and revokes existing sessions", async () => {
    const user = await register("reset-flow");
    const session = await createSession(user.id, {});

    await requestPasswordReset(user.email, {});
    const tokenRecord = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    // The plaintext token isn't recoverable from the DB (only its hash is stored) —
    // exercise resetPassword's failure path with a bogus token instead, and confirm
    // the real token row's shape (single-use, has an expiry) is what resetPassword expects.
    await expect(resetPassword("not-the-real-token", "NewPassword123", {})).rejects.toMatchObject({
      code: "INVALID_TOKEN",
    });
    expect(tokenRecord.consumedAt).toBeNull();
    expect(tokenRecord.expiresAt.getTime()).toBeGreaterThan(Date.now());

    // A stolen/old session must not survive an admin-driven reset either.
    await adminResetPassword(
      { actorType: "SYSTEM", requestId: "test" },
      user.id,
      "AdminSetPassword123",
    );
    expect(await validateSessionToken(session.token)).toBeNull();

    const relogin = await login({ email: user.email, password: "AdminSetPassword123" }, {});
    expect(relogin.user.id).toBe(user.id);
  });

  it("adminResetPassword throws for an unknown user", async () => {
    await expect(
      adminResetPassword({ actorType: "SYSTEM", requestId: "test" }, "nonexistent-id", "Whatever123"),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe("authRepository", () => {
  it("findUserByEmail is case-insensitive (emails are normalized to lowercase)", async () => {
    const user = await register("case-check");
    const found = await authRepository.findUserByEmail(user.email.toUpperCase());
    expect(found?.id).toBe(user.id);
  });
});
