import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/infrastructure/database/prisma";
import { redis } from "@/infrastructure/redis/client";
import {
  registerUser,
  login,
  listUsersForAdmin,
  setUserStatus,
  createUserForAdmin,
  setPlatformAdminStatus,
  listUserSessionsForAdmin,
  revokeUserSessionForAdmin,
} from "@/modules/auth/services/auth-service";
import { validateSessionToken } from "@/modules/auth/services/session-service";
import { listAuditEvents } from "@/modules/audit/service";
import { authRepository } from "@/modules/auth/repository";
import type { ActorContext } from "@/shared/types/actor-context";

const runId = Date.now();
const testEmail = (label: string) => `admin-users-test-${label}-${runId}@example.test`;
const PASSWORD = "CorrectHorse123";

async function setupPlatformAdmin(label: string) {
  const { user } = await registerUser({ email: testEmail(label), password: PASSWORD, name: label }, {});
  await prisma.user.update({ where: { id: user.id }, data: { isPlatformAdmin: true } });
  const actor: ActorContext = { actorType: "USER", requestId: "test", userId: user.id, isPlatformAdmin: true };
  return { user, actor };
}

afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});

describe("admin user management", () => {
  it("list/search returns matching users by email or name", async () => {
    const { actor: admin } = await setupPlatformAdmin("search-admin");
    const uniqueLabel = `search-target-${runId}`;
    await registerUser({ email: testEmail(uniqueLabel), password: PASSWORD, name: uniqueLabel }, {});

    const results = await listUsersForAdmin(admin, { search: uniqueLabel });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every((u) => u.email.includes(uniqueLabel) || u.name?.includes(uniqueLabel))).toBe(true);
  });

  it("disabling a user blocks subsequent login and revokes their existing session", async () => {
    const { actor: admin } = await setupPlatformAdmin("disable-admin");
    const { user } = await registerUser({ email: testEmail("disable-target"), password: PASSWORD, name: "target" }, {});
    const session = await login({ email: user.email, password: PASSWORD }, {});
    await expect(validateSessionToken(session.token)).resolves.not.toBeNull();

    await setUserStatus(admin, user.id, "DISABLED");

    await expect(login({ email: user.email, password: PASSWORD }, {})).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    await expect(validateSessionToken(session.token)).resolves.toBeNull();
  });

  it("reactivating a disabled user restores their ability to log in", async () => {
    const { actor: admin } = await setupPlatformAdmin("reactivate-admin");
    const { user } = await registerUser({ email: testEmail("reactivate-target"), password: PASSWORD, name: "target" }, {});

    await setUserStatus(admin, user.id, "DISABLED");
    await expect(login({ email: user.email, password: PASSWORD }, {})).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });

    await setUserStatus(admin, user.id, "ACTIVE");
    await expect(login({ email: user.email, password: PASSWORD }, {})).resolves.toMatchObject({ user: { id: user.id } });
  });

  it("a non-platform-admin actor is forbidden from listing users or changing their status", async () => {
    const { user: plainUser } = await registerUser({ email: testEmail("plain"), password: PASSWORD, name: "plain" }, {});
    const { user: targetUser } = await registerUser({ email: testEmail("plain-target"), password: PASSWORD, name: "target" }, {});
    const plainActor: ActorContext = { actorType: "USER", requestId: "test", userId: plainUser.id };

    await expect(listUsersForAdmin(plainActor, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setUserStatus(plainActor, targetUser.id, "DISABLED")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("createUserForAdmin creates a standalone account whose generated password works to log in", async () => {
    const { actor: admin } = await setupPlatformAdmin("create-user-admin");
    const email = testEmail("created-user");

    const { user, temporaryPassword } = await createUserForAdmin(admin, { email, name: "Created User" });
    expect(user.isPlatformAdmin).toBe(false);

    await expect(login({ email, password: temporaryPassword }, {})).resolves.toMatchObject({ user: { id: user.id } });
  });

  it("createUserForAdmin can grant platform admin at creation time", async () => {
    const { actor: admin } = await setupPlatformAdmin("create-admin-user-admin");
    const { user } = await createUserForAdmin(admin, { email: testEmail("created-platform-admin"), isPlatformAdmin: true });
    const reloaded = await authRepository.findUserById(user.id);
    expect(reloaded!.isPlatformAdmin).toBe(true);
  });

  it("createUserForAdmin rejects an email that's already registered", async () => {
    const { actor: admin } = await setupPlatformAdmin("create-dup-admin");
    const { user: existing } = await registerUser({ email: testEmail("dup-target"), password: PASSWORD, name: "x" }, {});
    await expect(createUserForAdmin(admin, { email: existing.email })).rejects.toMatchObject({ code: "EMAIL_ALREADY_REGISTERED" });
  });

  it("setPlatformAdminStatus grants and revokes platform admin access", async () => {
    const { actor: admin } = await setupPlatformAdmin("grant-revoke-admin");
    const { user: target } = await registerUser({ email: testEmail("grant-revoke-target"), password: PASSWORD, name: "target" }, {});

    await setPlatformAdminStatus(admin, target.id, true);
    expect((await authRepository.findUserById(target.id))!.isPlatformAdmin).toBe(true);

    await setPlatformAdminStatus(admin, target.id, false);
    expect((await authRepository.findUserById(target.id))!.isPlatformAdmin).toBe(false);
  });

  it("refuses to revoke platform admin access from the last remaining active platform admin", async () => {
    const { actor: admin, user: solelyRemainingAdmin } = await setupPlatformAdmin("last-admin-guard");

    // Temporarily deactivate every OTHER active platform admin so the global count is
    // genuinely 1 — countPlatformAdmins() is a platform-wide invariant, not scoped to
    // this test, so this is the only way to exercise the boundary in a shared dev DB.
    // Always restored in `finally`, even if the assertion below throws.
    const others = await prisma.user.findMany({ where: { isPlatformAdmin: true, status: "ACTIVE", id: { not: solelyRemainingAdmin.id } }, select: { id: true } });
    await prisma.user.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data: { status: "DISABLED" } });

    try {
      expect(await authRepository.countPlatformAdmins()).toBe(1);
      await expect(setPlatformAdminStatus(admin, solelyRemainingAdmin.id, false)).rejects.toMatchObject({ code: "CONFLICT" });
    } finally {
      await prisma.user.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data: { status: "ACTIVE" } });
    }
  });

  it("admin session list/revoke: lists a user's sessions and revokes one by id, refusing a mismatched user", async () => {
    const { actor: admin } = await setupPlatformAdmin("sessions-admin");
    const { user: target } = await registerUser({ email: testEmail("sessions-target"), password: PASSWORD, name: "target" }, {});
    const { user: otherUser } = await registerUser({ email: testEmail("sessions-other"), password: PASSWORD, name: "other" }, {});
    const session = await login({ email: target.email, password: PASSWORD }, {});

    const sessions = await listUserSessionsForAdmin(admin, target.id);
    expect(sessions.some((s) => s.id)).toBe(true);
    const sessionId = sessions[0].id;

    await expect(revokeUserSessionForAdmin(admin, otherUser.id, sessionId)).rejects.toMatchObject({ code: "NOT_FOUND" });

    await revokeUserSessionForAdmin(admin, target.id, sessionId);
    await expect(validateSessionToken(session.token)).resolves.toBeNull();
  });

  it("listAuditEvents filters by actorUserId, returning only that actor's events", async () => {
    const { actor: adminA, user: userA } = await setupPlatformAdmin("activity-a");
    const { actor: adminB } = await setupPlatformAdmin("activity-b");
    const { user: target } = await registerUser({ email: testEmail("activity-target"), password: PASSWORD, name: "target" }, {});

    await setUserStatus(adminA, target.id, "DISABLED");
    await setUserStatus(adminB, target.id, "ACTIVE");

    const eventsForA = await listAuditEvents(adminA, { actorUserId: userA.id });
    expect(eventsForA.every((e) => e.actorUserId === userA.id)).toBe(true);
    expect(eventsForA.some((e) => e.resourceId === target.id && e.action === "auth.admin_user_disabled")).toBe(true);
  });
});
