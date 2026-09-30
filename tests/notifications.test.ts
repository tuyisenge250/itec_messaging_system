import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/infrastructure/database/prisma";
import { redis } from "@/infrastructure/redis/client";
import { registerUser } from "@/modules/auth/services/auth-service";
import { createOrganization, submitOrganizationForReview } from "@/modules/organizations/service";
import { notifyAllPlatformAdmins, listMyNotifications, markNotificationRead } from "@/modules/notifications/service";
import { authRepository } from "@/modules/auth/repository";
import { RoleName } from "@/shared/constants/roles";
import type { ActorContext } from "@/shared/types/actor-context";

const runId = Date.now();
const testEmail = (label: string) => `notifications-test-${label}-${runId}@example.test`;

async function setupPlatformAdmin(label: string) {
  const { user } = await registerUser({ email: testEmail(label), password: "CorrectHorse123", name: label }, {});
  await prisma.user.update({ where: { id: user.id }, data: { isPlatformAdmin: true } });
  const actor: ActorContext = { actorType: "USER", requestId: "test", userId: user.id, isPlatformAdmin: true };
  return { user, actor };
}

async function setupOrg(label: string) {
  const { user } = await registerUser({ email: testEmail(label), password: "CorrectHorse123", name: label }, {});
  const created = await createOrganization({ actorType: "USER", requestId: "test", userId: user.id }, { legalName: `Notifications Test Org ${label} ${runId}` });
  const adminRole = await authRepository.findRoleByName(RoleName.ADMIN);
  const actor: ActorContext = { actorType: "USER", requestId: "test", userId: user.id, organizationId: created.id, roleId: adminRole!.id };
  return { user, organization: created, actor };
}

afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});

describe("notifications", () => {
  it("notifyAllPlatformAdmins creates one row per active platform admin", async () => {
    const { actor: adminA } = await setupPlatformAdmin("fanout-a");
    const { actor: adminB } = await setupPlatformAdmin("fanout-b");
    const title = `Fanout test ${runId}`;

    await notifyAllPlatformAdmins("SYSTEM", title, "test message");

    const { notifications: forA } = await listMyNotifications(adminA, {});
    const { notifications: forB } = await listMyNotifications(adminB, {});
    expect(forA.some((n) => n.title === title)).toBe(true);
    expect(forB.some((n) => n.title === title)).toBe(true);
  });

  it("submitting an organization for review notifies platform admins end to end", async () => {
    const { actor: admin } = await setupPlatformAdmin("submit-review");
    const { actor: orgActor, organization } = await setupOrg("submit-review-org");

    await submitOrganizationForReview(orgActor, organization.id);

    const { notifications } = await listMyNotifications(admin, {});
    expect(notifications.some((n) => n.type === "SYSTEM" && n.organizationId === organization.id)).toBe(true);
  });

  it("a user can only mark their own notification as read", async () => {
    const { actor: ownerActor, user: owner } = await setupPlatformAdmin("mark-read-owner");
    const { actor: otherActor } = await setupPlatformAdmin("mark-read-other");

    await notifyAllPlatformAdmins("SYSTEM", `Mark-read test ${runId}`, "msg");
    const { notifications } = await listMyNotifications(ownerActor, {});
    const mine = notifications.find((n) => n.userId === owner.id && n.title === `Mark-read test ${runId}`)!;

    await expect(markNotificationRead(otherActor, mine.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    const updated = await markNotificationRead(ownerActor, mine.id);
    expect(updated.readAt).not.toBeNull();
  });
});
