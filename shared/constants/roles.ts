/**
 * Roles are DB rows (see the `Role` model in prisma/schema.prisma), not a
 * compile-time enum — RBAC is driven entirely by the Role/Permission/
 * RolePermission tables so it can evolve without a migration+deploy for
 * every permission tweak. These constants are the *canonical names* the
 * seed script creates and that a few call sites need to reference directly
 * (e.g. "don't let an org remove its last ADMIN"). They are names, not a
 * source of authorization truth — authorize() in
 * modules/auth/services/authorization-service.ts always checks permissions
 * via the DB, never `role.name === "ADMIN"` string comparisons.
 */
export const RoleName = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  COMPLIANCE_OFFICER: "COMPLIANCE_OFFICER",
  FINANCE: "FINANCE",
  DEVELOPER: "DEVELOPER",
  OPERATOR: "OPERATOR",
  MEMBER: "MEMBER",
} as const;

export type RoleName = (typeof RoleName)[keyof typeof RoleName];
