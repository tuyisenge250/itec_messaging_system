import { prisma } from "@/infrastructure/database/prisma";
import { AppError } from "@/shared/errors/app-error";
import type { ActorContext } from "@/shared/types/actor-context";
import type { PermissionCode } from "@/shared/constants/permissions";

/**
 * Centralized authorization. Every sensitive operation must go through
 * `assertPermission` (or `hasPermission` for a soft check) instead of
 * comparing role names inline — this is the one place that knows how a
 * permission is granted (platform admin bypass, DB role->permission join
 * for dashboard users, or an API key's own `scopes` array).
 */

async function loadRolePermissionCodes(roleId: string): Promise<Set<string>> {
  const rows = await prisma.rolePermission.findMany({
    where: { roleId },
    include: { permission: true },
  });
  return new Set(rows.map((row) => row.permission.code));
}

/**
 * Resolves the full permission-code list for a role — used to tell the
 * frontend what a session user can actually do (nav/button visibility), not
 * as a security boundary itself (every mutating endpoint still calls
 * assertPermission server-side regardless of what the client was told).
 */
export async function getPermissionCodesForRole(roleId: string): Promise<string[]> {
  return Array.from(await loadRolePermissionCodes(roleId));
}

export async function hasPermission(actor: ActorContext, permission: PermissionCode): Promise<boolean> {
  if (actor.actorType === "SYSTEM") return true;
  if (actor.actorType === "USER" && actor.isPlatformAdmin) return true;

  if (actor.actorType === "API_KEY") {
    return (actor.apiKeyScopes ?? []).includes(permission);
  }

  if (actor.actorType === "USER") {
    if (!actor.roleId) return false;
    const codes = await loadRolePermissionCodes(actor.roleId);
    return codes.has(permission);
  }

  return false;
}

export async function assertPermission(actor: ActorContext, permission: PermissionCode): Promise<void> {
  const allowed = await hasPermission(actor, permission);
  if (!allowed) {
    throw AppError.forbidden(`Missing required permission: ${permission}`);
  }
}

/**
 * Guards every organization-scoped route/service call. `organizationId` here
 * must come from the authenticated actor (session membership or API key),
 * never echoed back from a client-supplied path/body param without this
 * check — a user from Organization A must never reach Organization B's data
 * by changing an ID in the URL.
 */
export function assertOrganizationAccess(actor: ActorContext, organizationId: string): void {
  if (actor.actorType === "SYSTEM") return;
  if (actor.actorType === "USER" && actor.isPlatformAdmin) return;
  if (actor.organizationId !== organizationId) {
    throw AppError.forbidden("You do not have access to this organization");
  }
}

/** Guards a specific resource row against cross-tenant access once it's been loaded. */
export function assertResourceBelongsToOrganization(
  resourceOrganizationId: string | null | undefined,
  organizationId: string,
): void {
  if (!resourceOrganizationId || resourceOrganizationId !== organizationId) {
    throw AppError.notFound();
  }
}

export function requirePlatformAdmin(actor: ActorContext): void {
  if (actor.actorType === "SYSTEM") return;
  if (actor.actorType !== "USER" || !actor.isPlatformAdmin) {
    throw AppError.forbidden("Platform administrator access required");
  }
}
