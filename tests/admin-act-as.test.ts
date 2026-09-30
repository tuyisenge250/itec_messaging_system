import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/infrastructure/database/prisma";
import { redis } from "@/infrastructure/redis/client";
import { registerUser } from "@/modules/auth/services/auth-service";
import { createOrganization, startActingAsOrganization } from "@/modules/organizations/service";
import { listAuditEvents } from "@/modules/audit/service";
import type { ActorContext } from "@/shared/types/actor-context";

const runId = Date.now();
const testEmail = (label: string) => `admin-act-as-test-${label}-${runId}@example.test`;

async function setupPlatformAdmin(label: string) {
  const { user } = await registerUser({ email: testEmail(label), password: "CorrectHorse123", name: label }, {});
  await prisma.user.update({ where: { id: user.id }, data: { isPlatformAdmin: true } });
  const actor: ActorContext = { actorType: "USER", requestId: "test", userId: user.id, isPlatformAdmin: true };
  return { user, actor };
}

afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});

describe("platform admin 'view as organization'", () => {
  it("records an audit event and returns basic org info", async () => {
    const { actor } = await setupPlatformAdmin("start");
    const { user: ownerUser } = await registerUser({ email: testEmail("owner"), password: "CorrectHorse123", name: "owner" }, {});
    const ownerActor: ActorContext = { actorType: "USER", requestId: "test", userId: ownerUser.id };
    const organization = await createOrganization(ownerActor, { legalName: `Act-As Test Org ${runId}` });

    const result = await startActingAsOrganization(actor, organization.id);
    expect(result).toEqual({ organizationId: organization.id, organizationName: organization.legalName });

    const events = await listAuditEvents(actor, { organizationId: organization.id });
    expect(events.some((e) => e.action === "organization.admin_view_started" && e.actorUserId === actor.userId)).toBe(true);
  });

  it("rejects an unknown organization id", async () => {
    const { actor } = await setupPlatformAdmin("missing-org");
    await expect(startActingAsOrganization(actor, "nonexistent-org-id")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("a non-platform-admin actor is forbidden", async () => {
    const { user: plainUser } = await registerUser({ email: testEmail("plain"), password: "CorrectHorse123", name: "plain" }, {});
    const plainActor: ActorContext = { actorType: "USER", requestId: "test", userId: plainUser.id };
    const organization = await createOrganization(plainActor, { legalName: `Act-As Forbidden Test Org ${runId}` });

    await expect(startActingAsOrganization(plainActor, organization.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
