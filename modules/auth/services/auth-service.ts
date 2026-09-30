import { authRepository } from "../repository";
import { hashPassword, verifyPassword, generateTemporaryPassword } from "./password-service";
import { createSession, revokeSessionByToken, revokeAllSessionsForUser, revokeSessionById, listSessionsForUser } from "./session-service";
import { checkRateLimit, resetRateLimit } from "@/infrastructure/redis/rate-limiter";
import { recordAuditEvent } from "@/modules/audit/service";
import { generateRandomToken, sha256Hex } from "@/shared/utils/crypto";
import { assertPermission, requirePlatformAdmin } from "./authorization-service";
import { PermissionCode } from "@/shared/constants/permissions";
import { AppError } from "@/shared/errors/app-error";
import { ErrorCode } from "@/shared/errors/error-codes";
import type { ActorContext } from "@/shared/types/actor-context";
import type { User, UserStatus } from "@/generated/prisma/client";

/**
 * Current authentication: email + password + secure session. Email
 * verification and MFA are intentionally NOT implemented — this stage has
 * no email or MFA/phone-verification provider configured. The architecture
 * (separate password-service/session-service/authorization-service files,
 * no email-verified gate anywhere in login) is deliberately structured so
 * EmailVerificationService / MfaService can be added later without
 * reworking this module. See docs/architecture.md "Authentication".
 */

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

// Deliberately generic — never confirm/deny whether an email is registered.
const GENERIC_LOGIN_FAILURE = "Invalid email or password";

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

export async function registerUser(
  input: { email: string; password: string; name?: string },
  meta: RequestMeta,
): Promise<{ user: User }> {
  if (meta.ipAddress) {
    const ipLimit = await checkRateLimit(`register:ip:${meta.ipAddress}`, 10, 60 * 60);
    if (!ipLimit.allowed) throw AppError.rateLimited("Too many registration attempts. Please try again later.");
  }

  const existing = await authRepository.findUserByEmail(input.email);
  if (existing) {
    throw AppError.of(ErrorCode.EMAIL_ALREADY_REGISTERED, "An account with this email already exists", 409);
  }

  const passwordHash = await hashPassword(input.password);
  const user = await authRepository.createUser({ email: input.email, passwordHash, name: input.name });

  await recordAuditEvent({
    actor: { actorType: "USER", userId: user.id, requestId: "n/a", ...meta },
    action: "auth.register",
    resourceType: "User",
    resourceId: user.id,
  });

  return { user };
}

export interface LoginResult {
  user: User;
  token: string;
  expiresAt: Date;
}

export async function login(input: { email: string; password: string }, meta: RequestMeta): Promise<LoginResult> {
  const emailKey = `login:email:${input.email}`;
  const ipKey = meta.ipAddress ? `login:ip:${meta.ipAddress}` : undefined;

  const emailLimit = await checkRateLimit(emailKey, 10, 15 * 60);
  const ipLimit = ipKey ? await checkRateLimit(ipKey, 30, 15 * 60) : undefined;
  if (!emailLimit.allowed || (ipLimit && !ipLimit.allowed)) {
    throw AppError.rateLimited("Too many login attempts. Please try again later.");
  }

  const user = await authRepository.findUserByEmail(input.email);
  const passwordOk = user ? await verifyPassword(user.passwordHash, input.password) : false;

  if (!user || !passwordOk) {
    await recordAuditEvent({
      actor: { actorType: "SYSTEM", requestId: "n/a", ...meta },
      action: "auth.login_failed",
      resourceType: "User",
      resourceId: user?.id,
      metadata: { email: input.email },
    });
    throw AppError.of(ErrorCode.INVALID_CREDENTIALS, GENERIC_LOGIN_FAILURE, 401);
  }

  if (user.status !== "ACTIVE") {
    throw AppError.of(ErrorCode.INVALID_CREDENTIALS, GENERIC_LOGIN_FAILURE, 401);
  }

  await resetRateLimit(emailKey);
  const session = await createSession(user.id, meta);

  await recordAuditEvent({
    actor: { actorType: "USER", userId: user.id, requestId: "n/a", ...meta },
    action: "auth.login",
    resourceType: "User",
    resourceId: user.id,
  });

  return { user, ...session };
}

export async function logout(actor: ActorContext, token: string): Promise<void> {
  await revokeSessionByToken(token);
  await recordAuditEvent({ actor, action: "auth.logout", resourceType: "User", resourceId: actor.userId });
}

/**
 * Creates a password-reset token, but — since no email provider is
 * configured at this stage — there is currently no way to deliver it to the
 * user. The architecture is kept (token, expiry, single-use) for when an
 * email provider is wired in; until then, an administrator resets a user's
 * password directly (see adminResetPassword below). Never reveals whether
 * an email is registered.
 */
export async function requestPasswordReset(email: string, meta: RequestMeta): Promise<void> {
  const emailLimit = await checkRateLimit(`password-reset:email:${email}`, 5, 60 * 60);
  if (meta.ipAddress) {
    const ipLimit = await checkRateLimit(`password-reset:ip:${meta.ipAddress}`, 20, 60 * 60);
    if (!ipLimit.allowed) throw AppError.rateLimited("Too many requests. Please try again later.");
  }
  if (!emailLimit.allowed) throw AppError.rateLimited("Too many requests. Please try again later.");

  const user = await authRepository.findUserByEmail(email);
  if (!user) return; // never reveal whether an email is registered

  const token = generateRandomToken(32);
  await authRepository.createPasswordResetToken({
    userId: user.id,
    tokenHash: sha256Hex(token),
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
  });

  await recordAuditEvent({
    actor: { actorType: "USER", userId: user.id, requestId: "n/a", ...meta },
    action: "auth.password_reset_requested",
    resourceType: "User",
    resourceId: user.id,
    metadata: { emailProviderConfigured: false },
  });
}

export async function resetPassword(token: string, newPassword: string, meta: RequestMeta): Promise<void> {
  const record = await authRepository.findPasswordResetToken(sha256Hex(token));
  if (!record || record.consumedAt || record.expiresAt.getTime() < Date.now()) {
    throw AppError.of(ErrorCode.INVALID_TOKEN, "This reset link is invalid or has expired", 400);
  }

  const passwordHash = await hashPassword(newPassword);
  await authRepository.updatePasswordHash(record.userId, passwordHash);
  await authRepository.consumePasswordResetToken(record.id);

  // Resetting a password invalidates every existing session — a stolen session
  // token shouldn't survive a password reset.
  await revokeAllSessionsForUser(record.userId);

  await recordAuditEvent({
    actor: { actorType: "USER", userId: record.userId, requestId: "n/a", ...meta },
    action: "auth.password_reset_completed",
    resourceType: "User",
    resourceId: record.userId,
  });
}

/**
 * Administrator-initiated password reset — the actual working reset path
 * while no email provider is configured. Requires ADMIN_USERS_MANAGE
 * (checked by the caller), hashes the new password, revokes every existing
 * session for that user, and is audited.
 */
export async function adminResetPassword(actor: ActorContext, targetUserId: string, newPassword: string): Promise<void> {
  const target = await authRepository.findUserById(targetUserId);
  if (!target) throw AppError.notFound("User not found");

  const passwordHash = await hashPassword(newPassword);
  await authRepository.updatePasswordHash(targetUserId, passwordHash);
  await revokeAllSessionsForUser(targetUserId);

  await recordAuditEvent({
    actor,
    action: "auth.admin_password_reset",
    resourceType: "User",
    resourceId: targetUserId,
  });
}

/**
 * Self-service password change — requires the current password. Revokes
 * every existing session (including the one the request came in on) and
 * issues a fresh one, so the change also invalidates any other
 * already-logged-in device while not logging the requester themselves out.
 */
export async function changeOwnPassword(
  actor: ActorContext,
  currentPassword: string,
  newPassword: string,
  meta: RequestMeta,
): Promise<LoginResult> {
  if (!actor.userId) throw AppError.unauthenticated();
  const user = await authRepository.findUserById(actor.userId);
  if (!user) throw AppError.unauthenticated();

  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw AppError.of(ErrorCode.INVALID_CREDENTIALS, "Current password is incorrect", 401);
  }

  const passwordHash = await hashPassword(newPassword);
  await authRepository.updatePasswordHash(user.id, passwordHash);
  await revokeAllSessionsForUser(user.id);
  const session = await createSession(user.id, meta);

  await recordAuditEvent({ actor, action: "auth.password_changed", resourceType: "User", resourceId: user.id });
  return { user, ...session };
}

// --- Platform-admin user management ---

export async function listUsersForAdmin(
  actor: ActorContext,
  params: { search?: string; status?: UserStatus; isPlatformAdmin?: boolean; cursor?: string },
) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.ADMIN_USERS_MANAGE);
  return authRepository.listUsers({ ...params, take: 25 });
}

export async function getUserForAdmin(actor: ActorContext, userId: string) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.ADMIN_USERS_MANAGE);

  const user = await authRepository.findUserById(userId);
  if (!user) throw AppError.notFound();

  const memberships = await authRepository.listMembershipsForUser(userId);
  return {
    ...user,
    _count: { memberships: memberships.length },
    memberships: memberships.map((m) => ({
      organizationId: m.organizationId,
      organizationName: m.organization.legalName,
      role: m.role.name,
      status: m.status,
      joinedAt: m.joinedAt,
    })),
  };
}

/**
 * Disabling only blocks future logins (enforced at login()'s existing
 * `status !== "ACTIVE"` check) and revokes active sessions — it never touches
 * organization memberships, so reactivating restores prior access exactly as
 * it was.
 */
export async function setUserStatus(actor: ActorContext, userId: string, status: UserStatus) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.ADMIN_USERS_MANAGE);

  const target = await authRepository.findUserById(userId);
  if (!target) throw AppError.notFound();

  const updated = await authRepository.updateUserStatus(userId, status);
  if (status === "DISABLED") {
    await revokeAllSessionsForUser(userId);
  }

  await recordAuditEvent({
    actor,
    action: status === "DISABLED" ? "auth.admin_user_disabled" : "auth.admin_user_reactivated",
    resourceType: "User",
    resourceId: userId,
  });

  return updated;
}

/**
 * Creates a standalone platform account directly — not tied to any organization
 * membership (that's a separate step via Team Members / createMember). Generates a
 * one-time password the same way org-member creation does (see
 * modules/organizations/service.ts::createMember) since there's no email delivery to
 * send a real invite through at this stage.
 */
export async function createUserForAdmin(
  actor: ActorContext,
  input: { email: string; name?: string; isPlatformAdmin?: boolean },
) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.ADMIN_USERS_MANAGE);

  const existing = await authRepository.findUserByEmail(input.email);
  if (existing) throw AppError.of(ErrorCode.EMAIL_ALREADY_REGISTERED, "An account with this email already exists", 409);

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const user = await authRepository.createUser({ email: input.email, passwordHash, name: input.name });

  if (input.isPlatformAdmin) {
    await authRepository.updatePlatformAdminStatus(user.id, true);
  }

  await recordAuditEvent({
    actor,
    action: "auth.admin_user_created",
    resourceType: "User",
    resourceId: user.id,
    metadata: { email: input.email, isPlatformAdmin: Boolean(input.isPlatformAdmin) },
  });

  return { user: { ...user, isPlatformAdmin: Boolean(input.isPlatformAdmin) }, temporaryPassword };
}

/**
 * Refuses to strip the platform's last remaining admin — that would leave no one able
 * to reach /admin at all short of direct DB access.
 */
export async function setPlatformAdminStatus(actor: ActorContext, userId: string, isPlatformAdmin: boolean) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.ADMIN_USERS_MANAGE);

  const target = await authRepository.findUserById(userId);
  if (!target) throw AppError.notFound();

  if (!isPlatformAdmin && target.isPlatformAdmin) {
    const activeAdmins = await authRepository.countPlatformAdmins();
    if (activeAdmins <= 1) {
      throw AppError.conflict("Cannot remove platform administrator access from the last remaining platform admin");
    }
  }

  const updated = await authRepository.updatePlatformAdminStatus(userId, isPlatformAdmin);

  await recordAuditEvent({
    actor,
    action: isPlatformAdmin ? "auth.admin_platform_admin_granted" : "auth.admin_platform_admin_revoked",
    resourceType: "User",
    resourceId: userId,
  });

  return updated;
}

export async function listUserSessionsForAdmin(actor: ActorContext, userId: string) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.ADMIN_USERS_MANAGE);
  return listSessionsForUser(userId);
}

export async function revokeUserSessionForAdmin(actor: ActorContext, userId: string, sessionId: string) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.ADMIN_USERS_MANAGE);
  await revokeSessionById(userId, sessionId);

  await recordAuditEvent({
    actor,
    action: "auth.admin_session_revoked",
    resourceType: "Session",
    resourceId: sessionId,
    metadata: { userId },
  });
}
