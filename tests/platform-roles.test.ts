import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/infrastructure/database/prisma";
import { redis } from "@/infrastructure/redis/client";
import { registerUser } from "@/modules/auth/services/auth-service";
import { listGlobalRolesForAdmin, updateGlobalRolePermissions } from "@/modules/roles/service";
import { hasPermission } from "@/modules/auth/services/authorization-service";
import { authRepository } from "@/modules/auth/repository";
import { RoleName } from "@/shared/constants/roles";
import { PermissionCode, ORG_ASSIGNABLE_PERMISSION_CODES } from "@/shared/constants/permissions";
import type { ActorContext } from "@/shared/types/actor-context";

const runId = Date.now();
const testEmail = (label: string) => `platform-roles-test-${label}-${runId}@example.test`;

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

describe("platform global role/permission defaults", () => {
  it("lists the global (organizationId=null) roles", async () => {
    const { actor } = await setupPlatformAdmin("list");
    const roles = await listGlobalRolesForAdmin(actor);
    expect(roles.some((r) => r.name === RoleName.DEVELOPER)).toBe(true);
    expect(roles.some((r) => r.name === RoleName.ADMIN)).toBe(true);
  });

  it("editing a global role's permissions changes what every actor with that role can do immediately — and restoring it reverts that immediately too", async () => {
    const { actor } = await setupPlatformAdmin("edit-reflects");
    const devRole = await authRepository.findRoleByName(RoleName.DEVELOPER);
    const before = await listGlobalRolesForAdmin(actor);
    const devDto = before.find((r) => r.id === devRole!.id)!;
    const originalCodes = devDto.permissionCodes;
    const probeActor: ActorContext = { actorType: "USER", requestId: "test", userId: "probe-user-id", roleId: devRole!.id };

    // Pick any org-assignable code DEVELOPER doesn't already have, rather than
    // hardcoding one — its default grant set can legitimately change over time.
    const probeCode = ORG_ASSIGNABLE_PERMISSION_CODES.find((c) => !originalCodes.includes(c));
    expect(probeCode).toBeDefined();
    await expect(hasPermission(probeActor, probeCode!)).resolves.toBe(false);

    try {
      await updateGlobalRolePermissions(actor, devRole!.id, [...originalCodes, probeCode!]);
      // No new membership, no new session — the SAME role row now grants it to anyone holding it.
      await expect(hasPermission(probeActor, probeCode!)).resolves.toBe(true);
    } finally {
      await updateGlobalRolePermissions(actor, devRole!.id, originalCodes);
    }

    await expect(hasPermission(probeActor, probeCode!)).resolves.toBe(false);
  });

  it("refuses to grant a platform-only permission code to a global role", async () => {
    const { actor } = await setupPlatformAdmin("reject-platform-only");
    const devRole = await authRepository.findRoleByName(RoleName.DEVELOPER);

    await expect(updateGlobalRolePermissions(actor, devRole!.id, [PermissionCode.PROVIDER_MANAGE])).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("refuses to target a custom (org-owned) role through the global-role endpoint", async () => {
    const { actor } = await setupPlatformAdmin("reject-custom-role");
    const customRole = await prisma.role.create({
      data: { name: `Custom Probe Role ${runId}`, organizationId: (await prisma.organization.findFirstOrThrow()).id, isSystem: false },
    });

    await expect(updateGlobalRolePermissions(actor, customRole.id, [PermissionCode.CONTACTS_READ])).rejects.toMatchObject({ code: "NOT_FOUND" });

    await prisma.role.delete({ where: { id: customRole.id } });
  });

  it("a non-platform-admin actor is forbidden from listing or editing global roles", async () => {
    const { user: plainUser } = await registerUser({ email: testEmail("plain"), password: "CorrectHorse123", name: "plain" }, {});
    const plainActor: ActorContext = { actorType: "USER", requestId: "test", userId: plainUser.id };
    const devRole = await authRepository.findRoleByName(RoleName.DEVELOPER);

    await expect(listGlobalRolesForAdmin(plainActor)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateGlobalRolePermissions(plainActor, devRole!.id, [])).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
