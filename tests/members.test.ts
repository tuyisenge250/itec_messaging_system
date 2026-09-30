import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/infrastructure/database/prisma";
import { redis } from "@/infrastructure/redis/client";
import { registerUser } from "@/modules/auth/services/auth-service";
import { verifyPassword } from "@/modules/auth/services/password-service";
import { createOrganization, createMember, resetMemberPassword, removeMember } from "@/modules/organizations/service";
import { authRepository } from "@/modules/auth/repository";
import { RoleName } from "@/shared/constants/roles";
import type { ActorContext } from "@/shared/types/actor-context";

const runId = Date.now();
const testEmail = (label: string) => `members-test-${label}-${runId}@example.test`;

async function setupOrg(label: string) {
  const { user } = await registerUser({ email: testEmail(label), password: "CorrectHorse123", name: label }, {});
  const created = await createOrganization({ actorType: "USER", requestId: "test", userId: user.id }, { legalName: `Members Test Org ${label} ${runId}` });
  const adminRole = await authRepository.findRoleByName(RoleName.ADMIN);
  const actor: ActorContext = { actorType: "USER", requestId: "test", userId: user.id, organizationId: created.id, roleId: adminRole!.id };
  return { user, organization: created, actor, adminRole: adminRole! };
}

afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});

describe("creating a team member directly (no prior registration required)", () => {
  it("creates a brand-new account and returns a one-time password that actually authenticates", async () => {
    const { actor, organization, adminRole } = await setupOrg("new-account");
    const email = testEmail("brand-new");

    const { membership, temporaryPassword } = await createMember(actor, organization.id, { email, name: "New Person", roleId: adminRole.id });
    expect(temporaryPassword).not.toBeNull();
    expect(membership.status).toBe("ACTIVE");

    const user = await authRepository.findUserByEmail(email);
    expect(user).not.toBeNull();
    expect(user!.name).toBe("New Person");
    await expect(verifyPassword(user!.passwordHash, temporaryPassword!)).resolves.toBe(true);
  });

  it("attaches an existing account instead of creating a duplicate, and never sets its password", async () => {
    const orgA = await setupOrg("existing-a");
    const orgB = await setupOrg("existing-b");
    const { user: existingUser } = await registerUser({ email: testEmail("existing-user"), password: "CorrectHorse123", name: "Existing" }, {});
    const originalHash = (await authRepository.findUserById(existingUser.id))!.passwordHash;

    const { membership, temporaryPassword } = await createMember(orgA.actor, orgA.organization.id, { email: existingUser.email, roleId: orgA.adminRole.id });
    expect(temporaryPassword).toBeNull();
    expect(membership.userId).toBe(existingUser.id);

    const afterHash = (await authRepository.findUserById(existingUser.id))!.passwordHash;
    expect(afterHash).toBe(originalHash);

    // Attaching the same existing user to a second org must not collide/duplicate either.
    const secondMembership = await createMember(orgB.actor, orgB.organization.id, { email: existingUser.email, roleId: orgB.adminRole.id });
    expect(secondMembership.membership.userId).toBe(existingUser.id);
    expect(secondMembership.membership.organizationId).toBe(orgB.organization.id);
  });

  it("rejects creating a member with an email already active in the same organization", async () => {
    const { actor, organization, adminRole } = await setupOrg("dup-active");
    const email = testEmail("dup-active-member");
    await createMember(actor, organization.id, { email, roleId: adminRole.id });
    await expect(createMember(actor, organization.id, { email, roleId: adminRole.id })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("org-scoped member password reset", () => {
  it("lets an org admin reset a dedicated member's password, invalidating the old one", async () => {
    const { actor, organization, adminRole } = await setupOrg("reset-happy");
    const email = testEmail("reset-target");
    const created = await createMember(actor, organization.id, { email, roleId: adminRole.id });
    const userId = created.membership.userId;

    const { temporaryPassword: newPassword } = await resetMemberPassword(actor, organization.id, created.membership.id);
    const user = await authRepository.findUserById(userId);
    await expect(verifyPassword(user!.passwordHash, newPassword)).resolves.toBe(true);
    await expect(verifyPassword(user!.passwordHash, created.temporaryPassword!)).resolves.toBe(false);
  });

  it("refuses to reset the password of a member who also belongs to another organization", async () => {
    const orgA = await setupOrg("reset-shared-a");
    const orgB = await setupOrg("reset-shared-b");
    const { user: sharedUser } = await registerUser({ email: testEmail("shared-user"), password: "CorrectHorse123", name: "Shared" }, {});
    await createMember(orgA.actor, orgA.organization.id, { email: sharedUser.email, roleId: orgA.adminRole.id });
    const membershipB = await createMember(orgB.actor, orgB.organization.id, { email: sharedUser.email, roleId: orgB.adminRole.id });

    await expect(resetMemberPassword(orgB.actor, orgB.organization.id, membershipB.membership.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("a non-privileged member cannot reset another member's password", async () => {
    const { actor, organization, adminRole } = await setupOrg("reset-forbidden");
    const memberRole = await authRepository.findRoleByName(RoleName.MEMBER);
    const target = await createMember(actor, organization.id, { email: testEmail("reset-forbidden-target"), roleId: adminRole.id });

    const { user: plainUser } = await registerUser({ email: testEmail("reset-forbidden-actor"), password: "CorrectHorse123", name: "plain" }, {});
    await prisma.organizationMembership.create({
      data: { organizationId: organization.id, userId: plainUser.id, roleId: memberRole!.id, status: "ACTIVE", joinedAt: new Date() },
    });
    const plainActor: ActorContext = { actorType: "USER", requestId: "test", userId: plainUser.id, organizationId: organization.id, roleId: memberRole!.id };

    await expect(resetMemberPassword(plainActor, organization.id, target.membership.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses to reset the password of a removed member", async () => {
    const { actor, organization, adminRole } = await setupOrg("reset-removed");
    const target = await createMember(actor, organization.id, { email: testEmail("reset-removed-target"), roleId: adminRole.id });
    await removeMember(actor, organization.id, target.membership.id);

    await expect(resetMemberPassword(actor, organization.id, target.membership.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
