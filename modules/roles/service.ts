import { rolesRepository } from "./repository";
import { assertPermission, assertOrganizationAccess, requirePlatformAdmin } from "@/modules/auth/services/authorization-service";
import { recordAuditEvent } from "@/modules/audit/service";
import { AppError } from "@/shared/errors/app-error";
import { PermissionCode, ORG_ASSIGNABLE_PERMISSION_CODES } from "@/shared/constants/permissions";
import { Prisma } from "@/generated/prisma/client";
import type { ActorContext } from "@/shared/types/actor-context";
import type { z } from "zod";
import type { createRoleSchema, updateRoleSchema } from "./validation";

function toRoleDto<T extends { permissions: Array<{ permission: { code: string } }> }>(role: T) {
  const { permissions, ...rest } = role;
  return { ...rest, permissionCodes: permissions.map((p) => p.permission.code) };
}

/** Rejects any code that isn't a real, org-assignable permission — the actual security boundary (the frontend picker is only a convenience filter on top of this). */
function assertAssignablePermissionCodes(codes: string[]): void {
  const invalid = codes.filter((code) => !ORG_ASSIGNABLE_PERMISSION_CODES.includes(code as PermissionCode));
  if (invalid.length > 0) {
    throw AppError.validation(`These permissions cannot be assigned to an organization role: ${invalid.join(", ")}`);
  }
}

/** Every organization sees the same global system roles (read-only reference) plus its own custom roles. */
export async function listRolesForOrganization(actor: ActorContext, organizationId: string) {
  assertOrganizationAccess(actor, organizationId);

  const [global, custom] = await Promise.all([rolesRepository.listGlobal(), rolesRepository.listForOrganization(organizationId)]);
  return {
    global: global.map((r) => ({ ...toRoleDto(r), isSystem: true })),
    custom: custom.map((r) => ({ ...toRoleDto(r), isSystem: false })),
  };
}

export async function createRole(actor: ActorContext, organizationId: string, input: z.infer<typeof createRoleSchema>) {
  await assertPermission(actor, PermissionCode.ROLES_MANAGE);
  assertOrganizationAccess(actor, organizationId);
  if (!actor.userId) throw AppError.unauthenticated();

  assertAssignablePermissionCodes(input.permissionCodes);
  const permissions = await rolesRepository.findPermissionsByCodes(input.permissionCodes);
  if (permissions.length !== new Set(input.permissionCodes).size) {
    throw AppError.validation("One or more permission codes are unknown");
  }

  try {
    const role = await rolesRepository.create({
      organizationId,
      name: input.name,
      description: input.description,
      createdByUserId: actor.userId,
      permissionIds: permissions.map((p) => p.id),
    });

    await recordAuditEvent({
      actor,
      action: "role.create",
      resourceType: "Role",
      resourceId: role.id,
      organizationId,
      metadata: { name: input.name, permissionCodes: input.permissionCodes },
    });

    return toRoleDto(role);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw AppError.conflict(`A role named "${input.name}" already exists in this organization`);
    }
    throw error;
  }
}

async function loadOwnedCustomRole(organizationId: string, roleId: string) {
  const role = await rolesRepository.findById(roleId);
  // notFound (not forbidden) for both "doesn't exist" and "belongs to another
  // organization or is a global role" — never confirms another org's role exists.
  if (!role || role.organizationId !== organizationId) throw AppError.notFound("Role not found");
  return role;
}

export async function updateRole(actor: ActorContext, organizationId: string, roleId: string, input: z.infer<typeof updateRoleSchema>) {
  await assertPermission(actor, PermissionCode.ROLES_MANAGE);
  assertOrganizationAccess(actor, organizationId);

  await loadOwnedCustomRole(organizationId, roleId);

  let permissionIds: string[] | undefined;
  if (input.permissionCodes) {
    assertAssignablePermissionCodes(input.permissionCodes);
    const permissions = await rolesRepository.findPermissionsByCodes(input.permissionCodes);
    if (permissions.length !== new Set(input.permissionCodes).size) {
      throw AppError.validation("One or more permission codes are unknown");
    }
    permissionIds = permissions.map((p) => p.id);
  }

  try {
    const role = await rolesRepository.update(roleId, { name: input.name, description: input.description, permissionIds });

    await recordAuditEvent({
      actor,
      action: "role.update",
      resourceType: "Role",
      resourceId: roleId,
      organizationId,
      metadata: input,
    });

    return toRoleDto(role);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw AppError.conflict(`A role named "${input.name}" already exists in this organization`);
    }
    throw error;
  }
}

export async function deleteRole(actor: ActorContext, organizationId: string, roleId: string) {
  await assertPermission(actor, PermissionCode.ROLES_MANAGE);
  assertOrganizationAccess(actor, organizationId);

  await loadOwnedCustomRole(organizationId, roleId);

  const membersUsingRole = await rolesRepository.countMembersUsingRole(roleId);
  if (membersUsingRole > 0) {
    throw AppError.conflict(`Cannot delete a role assigned to ${membersUsingRole} active member(s) — reassign them first`);
  }

  await rolesRepository.delete(roleId);
  await recordAuditEvent({ actor, action: "role.delete", resourceType: "Role", resourceId: roleId, organizationId });
}

/**
 * Global (organizationId = null) roles — ADMIN, DEVELOPER, FINANCE, etc. —
 * are shared rows every organization references directly, so editing one's
 * permission grants changes the default for every organization on the
 * platform immediately. Platform-only, gated by PLATFORM_ROLES_MANAGE
 * (never assignable to an org's own custom role — see
 * PLATFORM_ONLY_PERMISSION_CODES in shared/constants/permissions.ts).
 */
export async function listGlobalRolesForAdmin(actor: ActorContext) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.PLATFORM_ROLES_MANAGE);
  const roles = await rolesRepository.listGlobal();
  return roles.map(toRoleDto);
}

export async function updateGlobalRolePermissions(actor: ActorContext, roleId: string, permissionCodes: string[]) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.PLATFORM_ROLES_MANAGE);

  const role = await rolesRepository.findById(roleId);
  // Guards against ever hitting this on a custom (org-owned) role, even though
  // the frontend only ever lists global ones — this is the actual boundary.
  if (!role || role.organizationId !== null) throw AppError.notFound("Global role not found");

  assertAssignablePermissionCodes(permissionCodes);
  const permissions = await rolesRepository.findPermissionsByCodes(permissionCodes);
  if (permissions.length !== new Set(permissionCodes).size) {
    throw AppError.validation("One or more permission codes are unknown");
  }

  const updated = await rolesRepository.update(roleId, { permissionIds: permissions.map((p) => p.id) });

  await recordAuditEvent({
    actor,
    action: "role.global_update",
    resourceType: "Role",
    resourceId: roleId,
    // Explicitly null, not actor.organizationId's default fallback — this is
    // a platform-wide action, never attributable to whatever organization the
    // actor happens to be "viewing as" at the time (see acting-organization.ts).
    organizationId: null,
    metadata: { name: role.name, permissionCodes, note: "affects every organization" },
  });

  return toRoleDto(updated);
}

/**
 * Resolves a roleId supplied by an invite/role-change request into a usable role:
 * either a global system role (usable by any organization) or this organization's
 * own custom role. Never resolves another organization's custom role — that's the
 * cross-tenant leak this whole check exists to prevent.
 */
export async function resolveAssignableRole(organizationId: string, roleId: string) {
  const role = await rolesRepository.findById(roleId);
  if (!role) throw AppError.validation("Unknown role");
  if (role.organizationId !== null && role.organizationId !== organizationId) {
    throw AppError.validation("This role does not belong to your organization");
  }
  return role;
}
