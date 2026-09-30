import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/infrastructure/database/prisma";
import { redis } from "@/infrastructure/redis/client";
import { registerUser } from "@/modules/auth/services/auth-service";
import { createOrganization, getOrganizationForAdmin, listMembers } from "@/modules/organizations/service";
import { listDocuments } from "@/modules/documents/service";
import { listSenderIdRequests, listSenderIds } from "@/modules/sender-ids/service";
import { listWalletTransactions } from "@/modules/wallets/service";
import { listMessages } from "@/modules/messaging/service";
import { listCampaigns } from "@/modules/campaigns/service";
import { listApiKeysForOrganization } from "@/modules/api-keys/service";
import { listWebhooks } from "@/modules/webhooks/service";
import { listPaymentIntents } from "@/modules/billing/payment-service";
import { listFraudEvents } from "@/modules/fraud/service";
import { authRepository } from "@/modules/auth/repository";
import { RoleName } from "@/shared/constants/roles";
import type { ActorContext } from "@/shared/types/actor-context";

const runId = Date.now();
const testEmail = (label: string) => `admin-org-test-${label}-${runId}@example.test`;

async function setupOrg(label: string) {
  const { user } = await registerUser({ email: testEmail(label), password: "CorrectHorse123", name: label }, {});
  const created = await createOrganization({ actorType: "USER", requestId: "test", userId: user.id }, { legalName: `Admin Org Test ${label} ${runId}` });
  const adminRole = await authRepository.findRoleByName(RoleName.ADMIN);
  const actor: ActorContext = { actorType: "USER", requestId: "test", userId: user.id, organizationId: created.id, roleId: adminRole!.id };
  return { user, organization: created, actor };
}

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

describe("admin organization detail", () => {
  it("getOrganizationForAdmin returns wallets and aggregate counts", async () => {
    const { organization } = await setupOrg("overview");
    const { actor: admin } = await setupPlatformAdmin("overview-admin");

    const detail = await getOrganizationForAdmin(admin, organization.id);
    expect(detail.wallets.length).toBeGreaterThanOrEqual(1);
    expect(detail.wallets.some((w) => w.environment === "SANDBOX")).toBe(true);
    expect(detail._count.memberships).toBe(1);
  });

  it("a platform admin can view every tab's data for an organization they are not a member of", async () => {
    const { organization } = await setupOrg("tabs");
    const { actor: admin } = await setupPlatformAdmin("tabs-admin");

    await expect(listMembers(admin, organization.id)).resolves.not.toThrow();
    await expect(listDocuments(admin, organization.id)).resolves.toEqual([]);
    await expect(listSenderIdRequests(admin, organization.id)).resolves.not.toThrow();
    await expect(listSenderIds(admin, organization.id)).resolves.not.toThrow();
    await expect(listWalletTransactions(admin, organization.id, "SANDBOX")).resolves.not.toThrow();
    await expect(listMessages(admin, organization.id)).resolves.toEqual([]);
    await expect(listCampaigns(admin, organization.id)).resolves.toEqual([]);
    const apiKeys = await listApiKeysForOrganization(admin, organization.id);
    expect(apiKeys.length).toBeGreaterThanOrEqual(1); // sandbox onboarding provisions one automatically
    await expect(listWebhooks(admin, organization.id)).resolves.toEqual([]);
    await expect(listPaymentIntents(admin, organization.id)).resolves.toEqual([]);
  });

  it("a non-platform-admin actor is forbidden from admin-only organization views", async () => {
    const { organization: viewerOrg, actor: nonAdminActor } = await setupOrg("non-admin");
    const { organization: targetOrg } = await setupOrg("non-admin-target");
    void viewerOrg;

    await expect(getOrganizationForAdmin(nonAdminActor, targetOrg.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Even calling with their OWN org id should be refused — this is an admin-only view, not a customer one.
    await expect(getOrganizationForAdmin(nonAdminActor, viewerOrg.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    // And they must not be able to reach another org's data through the org-scoped functions either.
    await expect(listMembers(nonAdminActor, targetOrg.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("fraud events are filterable by organizationId, scoped correctly", async () => {
    const { organization: orgA } = await setupOrg("fraud-a");
    const { organization: orgB } = await setupOrg("fraud-b");
    const { actor: admin } = await setupPlatformAdmin("fraud-admin");

    const event = await prisma.fraudEvent.create({
      data: { organizationId: orgA.id, eventType: "TEST_EVENT", severity: "LOW", description: "test fraud event", status: "OPEN" },
    });

    const forOrgA = await listFraudEvents(admin, undefined, undefined, orgA.id);
    expect(forOrgA.some((e) => e.id === event.id)).toBe(true);

    const forOrgB = await listFraudEvents(admin, undefined, undefined, orgB.id);
    expect(forOrgB.some((e) => e.id === event.id)).toBe(false);
  });
});
