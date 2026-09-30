import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/infrastructure/database/prisma";
import { redis } from "@/infrastructure/redis/client";
import { registerUser } from "@/modules/auth/services/auth-service";
import { createOrganization } from "@/modules/organizations/service";
import { authRepository } from "@/modules/auth/repository";
import { RoleName } from "@/shared/constants/roles";
import { createRole, updateRole, deleteRole, listRolesForOrganization } from "@/modules/roles/service";
import { createMember, updateMemberRole } from "@/modules/organizations/service";
import type { ActorContext } from "@/shared/types/actor-context";

const runId = Date.now();
const testEmail = (label: string) => `roles-test-${label}-${runId}@example.test`;

async function setupOrg(label: string) {
  const { user } = await registerUser({ email: testEmail(label), password: "CorrectHorse123", name: label }, {});
  const created = await createOrganization({ actorType: "USER", requestId: "test", userId: user.id }, { legalName: `Roles Test Org ${label} ${runId}` });
  const adminRole = await authRepository.findRoleByName(RoleName.ADMIN);
  const actor: ActorContext = { actorType: "USER", requestId: "test", userId: user.id, organizationId: created.id, roleId: adminRole!.id };
  return { user, organization: created, actor };
}

afterAll(async () => {
  // See tests/sandbox.test.ts for why org/user rows created here aren't cleaned up.
  await prisma.$disconnect();
  redis.disconnect();
});

describe("custom role permission boundary", () => {
  it("creates a custom role with an org-safe permission set", async () => {
    const { actor, organization } = await setupOrg("create");
    const role = await createRole(actor, organization.id, { name: "Support Agent", permissionCodes: ["sms.send", "sms.read"] });
    expect(role.organizationId).toBe(organization.id);
    expect(role.isSystem).toBe(false);
    expect(role.permissionCodes.sort()).toEqual(["sms.read", "sms.send"]);
  });

  it("rejects a platform-only permission (wallet.adjust) on a custom role", async () => {
    const { actor, organization } = await setupOrg("platform-only");
    await expect(createRole(actor, organization.id, { name: "Sneaky", permissionCodes: ["sms.send", "wallet.adjust"] })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects an unknown permission code", async () => {
    const { actor, organization } = await setupOrg("unknown-code");
    await expect(createRole(actor, organization.id, { name: "Bad Code", permissionCodes: ["not.a.real.permission"] })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects a duplicate role name within the same organization with a clean conflict, not a raw DB error", async () => {
    const { actor, organization } = await setupOrg("dup-name");
    await createRole(actor, organization.id, { name: "Ops", permissionCodes: ["sms.read"] });
    await expect(createRole(actor, organization.id, { name: "Ops", permissionCodes: ["sms.send"] })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("allows the same role name to be reused by a different organization", async () => {
    const orgA = await setupOrg("samename-a");
    const orgB = await setupOrg("samename-b");
    await createRole(orgA.actor, orgA.organization.id, { name: "Ops", permissionCodes: ["sms.read"] });
    await expect(createRole(orgB.actor, orgB.organization.id, { name: "Ops", permissionCodes: ["sms.send"] })).resolves.toMatchObject({ name: "Ops" });
  });

  it("a non-privileged member cannot create a role", async () => {
    const { organization } = await setupOrg("no-permission");
    const memberRole = await authRepository.findRoleByName(RoleName.MEMBER);
    const { user: plainUser } = await registerUser({ email: testEmail("plain-member"), password: "CorrectHorse123", name: "plain" }, {});
    // Directly attach as a MEMBER-role membership (no ROLES_MANAGE permission).
    await prisma.organizationMembership.create({
      data: { organizationId: organization.id, userId: plainUser.id, roleId: memberRole!.id, status: "ACTIVE", joinedAt: new Date() },
    });
    const plainActor: ActorContext = { actorType: "USER", requestId: "test", userId: plainUser.id, organizationId: organization.id, roleId: memberRole!.id };
    await expect(createRole(plainActor, organization.id, { name: "X", permissionCodes: ["sms.read"] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("custom role cross-tenant isolation", () => {
  it("cannot assign another organization's custom role via invite", async () => {
    const orgA = await setupOrg("cross-invite-a");
    const orgB = await setupOrg("cross-invite-b");
    const roleA = await createRole(orgA.actor, orgA.organization.id, { name: "Org A Role", permissionCodes: ["sms.read"] });

    const { user: outsideUser } = await registerUser({ email: testEmail("outside-invitee"), password: "CorrectHorse123", name: "outside" }, {});
    await expect(createMember(orgB.actor, orgB.organization.id, { email: outsideUser.email, roleId: roleA.id })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("cannot reassign a member to another organization's custom role", async () => {
    const orgA = await setupOrg("cross-update-a");
    const orgB = await setupOrg("cross-update-b");
    const roleA = await createRole(orgA.actor, orgA.organization.id, { name: "Org A Role 2", permissionCodes: ["sms.read"] });

    const memberRole = await authRepository.findRoleByName(RoleName.MEMBER);
    const { user: bUser } = await registerUser({ email: testEmail("org-b-member"), password: "CorrectHorse123", name: "b-member" }, {});
    const membership = await prisma.organizationMembership.create({
      data: { organizationId: orgB.organization.id, userId: bUser.id, roleId: memberRole!.id, status: "ACTIVE", joinedAt: new Date() },
    });

    await expect(updateMemberRole(orgB.actor, orgB.organization.id, membership.id, roleA.id)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("a custom role is never visible in another organization's role list", async () => {
    const orgA = await setupOrg("cross-list-a");
    const orgB = await setupOrg("cross-list-b");
    await createRole(orgA.actor, orgA.organization.id, { name: "Org A Only", permissionCodes: ["sms.read"] });

    const rolesForB = await listRolesForOrganization(orgB.actor, orgB.organization.id);
    expect(rolesForB.custom.find((r) => r.name === "Org A Only")).toBeUndefined();
  });
});

describe("custom role lifecycle", () => {
  it("blocks deleting a role that is currently assigned, allows it after reassignment", async () => {
    const { actor, organization, user } = await setupOrg("delete-in-use");
    const role = await createRole(actor, organization.id, { name: "In Use Role", permissionCodes: ["sms.read"] });

    const memberRole = await authRepository.findRoleByName(RoleName.MEMBER);
    const { user: memberUser } = await registerUser({ email: testEmail("delete-in-use-member"), password: "CorrectHorse123", name: "m" }, {});
    const membership = await prisma.organizationMembership.create({
      data: { organizationId: organization.id, userId: memberUser.id, roleId: memberRole!.id, status: "ACTIVE", joinedAt: new Date() },
    });
    await updateMemberRole(actor, organization.id, membership.id, role.id);

    await expect(deleteRole(actor, organization.id, role.id)).rejects.toMatchObject({ code: "CONFLICT" });

    await updateMemberRole(actor, organization.id, membership.id, memberRole!.id);
    await expect(deleteRole(actor, organization.id, role.id)).resolves.toBeUndefined();
    void user;
  });

  it("updating a role's permissions replaces the set rather than merging it", async () => {
    const { actor, organization } = await setupOrg("update-replace");
    const role = await createRole(actor, organization.id, { name: "Replace Me", permissionCodes: ["sms.read", "sms.send"] });
    const updated = await updateRole(actor, organization.id, role.id, { permissionCodes: ["contacts.read"] });
    expect(updated.permissionCodes).toEqual(["contacts.read"]);
  });
});
