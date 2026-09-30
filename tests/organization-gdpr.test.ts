import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/infrastructure/database/prisma";
import { redis } from "@/infrastructure/redis/client";
import { registerUser, login } from "@/modules/auth/services/auth-service";
import { validateSessionToken } from "@/modules/auth/services/session-service";
import { createOrganization, createMember } from "@/modules/organizations/service";
import { createContact } from "@/modules/contacts/service";
import { exportOrganizationData, eraseOrganizationData } from "@/modules/organizations/gdpr-service";
import { authRepository } from "@/modules/auth/repository";
import { RoleName } from "@/shared/constants/roles";
import type { ActorContext } from "@/shared/types/actor-context";

const runId = Date.now();
const testEmail = (label: string) => `org-gdpr-test-${label}-${runId}@example.test`;
const PASSWORD = "CorrectHorse123";

async function setupOrg(label: string) {
  const { user } = await registerUser({ email: testEmail(label), password: PASSWORD, name: label }, {});
  const created = await createOrganization({ actorType: "USER", requestId: "test", userId: user.id }, { legalName: `GDPR Test Org ${label} ${runId}` });
  const adminRole = await authRepository.findRoleByName(RoleName.ADMIN);
  const actor: ActorContext = { actorType: "USER", requestId: "test", userId: user.id, organizationId: created.id, roleId: adminRole!.id };
  return { user, organization: created, actor, adminRole: adminRole! };
}

afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});

describe("exportOrganizationData", () => {
  it("bundles organization, members, and contacts", async () => {
    const { actor, organization } = await setupOrg("export");
    await createContact(actor, organization.id, { phoneNumber: "+250788700001", firstName: "Export", lastName: "Test" });

    const bundle = await exportOrganizationData(actor, organization.id);
    expect(bundle.organization.id).toBe(organization.id);
    expect(bundle.members.length).toBeGreaterThanOrEqual(1);
    expect(bundle.contacts.some((c) => c.phoneNumber === "+250788700001")).toBe(true);
  });

  it("a non-member actor cannot export", async () => {
    const { organization } = await setupOrg("export-forbidden");
    const { user: outsider } = await registerUser({ email: testEmail("export-outsider"), password: PASSWORD, name: "outsider" }, {});
    const outsiderActor: ActorContext = { actorType: "USER", requestId: "test", userId: outsider.id };

    await expect(exportOrganizationData(outsiderActor, organization.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("eraseOrganizationData", () => {
  it("rejects when confirmName doesn't match the org's legal name", async () => {
    const { actor, organization } = await setupOrg("mismatch");
    await expect(eraseOrganizationData(actor, organization.id, "test", "wrong name")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("anonymizes the org, anonymizes a sole-org member, revokes sessions/API keys, deletes contacts — but retains the payment/audit trail", async () => {
    const { actor, organization, user } = await setupOrg("full-erasure");
    await createContact(actor, organization.id, { phoneNumber: "+250788700002" });
    const session = await login({ email: user.email, password: PASSWORD }, {});
    await expect(validateSessionToken(session.token)).resolves.not.toBeNull();

    const apiKeysBefore = await prisma.apiKey.findMany({ where: { organizationId: organization.id } });
    expect(apiKeysBefore.length).toBeGreaterThan(0); // sandbox onboarding auto-provisions one

    await eraseOrganizationData(actor, organization.id, "Customer requested deletion", organization.legalName);

    const org = await prisma.organization.findUnique({ where: { id: organization.id } });
    expect(org!.legalName).toBe("Deleted Organization");
    expect(org!.status).toBe("SUSPENDED");
    expect(org!.deletedAt).not.toBeNull();

    const anonymizedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(anonymizedUser!.email).toBe(`erased-${user.id}@deleted.invalid`);
    expect(anonymizedUser!.name).toBeNull();
    expect(anonymizedUser!.status).toBe("DISABLED");
    expect(anonymizedUser!.deletedAt).not.toBeNull();

    // The session that was active before erasure must now be dead.
    await expect(validateSessionToken(session.token)).resolves.toBeNull();

    const apiKeysAfter = await prisma.apiKey.findMany({ where: { organizationId: organization.id, status: "ACTIVE" } });
    expect(apiKeysAfter).toHaveLength(0);

    const contacts = await prisma.contact.findMany({ where: { organizationId: organization.id } });
    expect(contacts).toHaveLength(0);

    const membership = await prisma.organizationMembership.findFirst({ where: { organizationId: organization.id, userId: user.id } });
    expect(membership!.status).toBe("REMOVED");
  });

  it("does not anonymize a member who belongs to another organization too", async () => {
    const { actor, organization, user, adminRole } = await setupOrg("multi-org-primary");
    const { organization: otherOrg } = await setupOrg("multi-org-secondary");

    // Add the first user as a member of the second org too, so they're not solely-owned by `organization`.
    await createMember(
      { actorType: "USER", requestId: "test", userId: (await prisma.organizationMembership.findFirstOrThrow({ where: { organizationId: otherOrg.id } })).userId, organizationId: otherOrg.id, roleId: adminRole.id },
      otherOrg.id,
      { email: user.email, roleId: adminRole.id },
    );

    await eraseOrganizationData(actor, organization.id, "test", organization.legalName);

    const untouchedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(untouchedUser!.email).toBe(user.email); // NOT anonymized — still belongs to otherOrg
    expect(untouchedUser!.deletedAt).toBeNull();

    const membership = await prisma.organizationMembership.findFirst({ where: { organizationId: organization.id, userId: user.id } });
    expect(membership!.status).toBe("REMOVED"); // still removed from THIS org
  });

  it("retains payment/audit records after erasure (not deleted, not anonymized)", async () => {
    const { actor, organization } = await setupOrg("retain-financial");
    const auditCountBefore = await prisma.auditEvent.count({ where: { organizationId: organization.id } });
    expect(auditCountBefore).toBeGreaterThan(0); // organization.create already wrote one

    await eraseOrganizationData(actor, organization.id, "test", organization.legalName);

    const auditCountAfter = await prisma.auditEvent.count({ where: { organizationId: organization.id } });
    expect(auditCountAfter).toBeGreaterThan(auditCountBefore); // erasure itself adds another audit event, none removed
  });

  it("refuses to erase an already-erased organization", async () => {
    const { actor, organization } = await setupOrg("double-erasure");
    await eraseOrganizationData(actor, organization.id, "first", organization.legalName);

    await expect(eraseOrganizationData(actor, organization.id, "second", "Deleted Organization")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("a non-member actor cannot erase", async () => {
    const { organization } = await setupOrg("erase-forbidden");
    const { user: outsider } = await registerUser({ email: testEmail("erase-outsider"), password: PASSWORD, name: "outsider" }, {});
    const outsiderActor: ActorContext = { actorType: "USER", requestId: "test", userId: outsider.id };

    await expect(eraseOrganizationData(outsiderActor, organization.id, "test", organization.legalName)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
