import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/infrastructure/database/prisma";
import { redis } from "@/infrastructure/redis/client";
import { registerUser } from "@/modules/auth/services/auth-service";
import { createOrganization } from "@/modules/organizations/service";
import { suspendSenderId, activateSenderId } from "@/modules/sender-ids/service";
import type { ActorContext } from "@/shared/types/actor-context";

const runId = Date.now();
const testEmail = (label: string) => `admin-sender-ids-test-${label}-${runId}@example.test`;

async function setupOrgWithSenderId(label: string) {
  const { user } = await registerUser({ email: testEmail(label), password: "CorrectHorse123", name: label }, {});
  const created = await createOrganization({ actorType: "USER", requestId: "test", userId: user.id }, { legalName: `Sender ID Test Org ${label} ${runId}` });
  const senderId = created.sandboxOnboarding!.senderId;
  return { organization: created, senderId };
}

async function setupPlatformAdmin(label: string) {
  const { user } = await registerUser({ email: testEmail(label), password: "CorrectHorse123", name: label }, {});
  await prisma.user.update({ where: { id: user.id }, data: { isPlatformAdmin: true } });
  return { actor: { actorType: "USER", requestId: "test", userId: user.id, isPlatformAdmin: true } as ActorContext };
}

afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});

describe("admin sender ID suspend/activate", () => {
  it("suspends an active sender ID and records an audit event", async () => {
    const { actor } = await setupPlatformAdmin("suspend");
    const { organization, senderId } = await setupOrgWithSenderId("suspend-target");
    expect(senderId.status).toBe("ACTIVE");

    const updated = await suspendSenderId(actor, senderId.id);
    expect(updated.status).toBe("SUSPENDED");
    expect(updated.suspendedAt).not.toBeNull();

    const event = await prisma.auditEvent.findFirst({
      where: { action: "sender_id.suspended", resourceId: senderId.id, organizationId: organization.id },
    });
    expect(event).not.toBeNull();
  });

  it("reactivates a suspended sender ID", async () => {
    const { actor } = await setupPlatformAdmin("activate");
    const { senderId } = await setupOrgWithSenderId("activate-target");

    await suspendSenderId(actor, senderId.id);
    const reactivated = await activateSenderId(actor, senderId.id);
    expect(reactivated.status).toBe("ACTIVE");
    expect(reactivated.suspendedAt).toBeNull();
  });

  it("rejects an unknown sender ID", async () => {
    const { actor } = await setupPlatformAdmin("missing");
    await expect(suspendSenderId(actor, "nonexistent-sender-id")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("a non-platform-admin actor is forbidden", async () => {
    const { user: plainUser } = await registerUser({ email: testEmail("plain"), password: "CorrectHorse123", name: "plain" }, {});
    const plainActor: ActorContext = { actorType: "USER", requestId: "test", userId: plainUser.id };
    const { senderId } = await setupOrgWithSenderId("forbidden-target");

    await expect(suspendSenderId(plainActor, senderId.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
