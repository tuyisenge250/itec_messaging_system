/**
 * Permission codes. These are seeded as `Permission.code` rows (see
 * prisma/seed.ts) and joined to roles through `RolePermission`. Application
 * code must always reference `PermissionCode.X` here rather than typing raw
 * strings, so a typo becomes a compile error instead of a silent
 * authorization bypass — but the actual grant/deny decision always comes
 * from the database (Role -> RolePermission -> Permission), never from a
 * hardcoded map in this file. See
 * modules/auth/services/authorization-service.ts.
 */
export const PermissionCode = {
  ORGANIZATION_READ: "organization.read",
  ORGANIZATION_UPDATE: "organization.update",

  MEMBERS_READ: "members.read",
  MEMBERS_CREATE: "members.create",
  MEMBERS_UPDATE: "members.update",
  MEMBERS_REMOVE: "members.remove",

  ROLES_MANAGE: "roles.manage",

  DOCUMENTS_UPLOAD: "documents.upload",
  DOCUMENTS_READ: "documents.read",
  DOCUMENTS_REVIEW: "documents.review",

  SENDER_ID_READ: "sender_id.read",
  SENDER_ID_REQUEST: "sender_id.request",
  SENDER_ID_UPDATE: "sender_id.update",
  SENDER_ID_SUBMIT: "sender_id.submit",
  SENDER_ID_REVIEW: "sender_id.review",
  SENDER_ID_APPROVE: "sender_id.approve",
  SENDER_ID_REJECT: "sender_id.reject",
  SENDER_ID_MANAGE_LIFECYCLE: "sender_id.manage_lifecycle",

  SMS_SEND: "sms.send",
  SMS_READ: "sms.read",
  SMS_CANCEL: "sms.cancel",

  CAMPAIGN_CREATE: "campaign.create",
  CAMPAIGN_SEND: "campaign.send",
  CAMPAIGN_READ: "campaign.read",
  CAMPAIGN_CANCEL: "campaign.cancel",

  CONTACTS_READ: "contacts.read",
  CONTACTS_MANAGE: "contacts.manage",

  TEMPLATES_MANAGE: "templates.manage",

  WALLET_READ: "wallet.read",
  WALLET_PURCHASE: "wallet.purchase",
  WALLET_ADJUST: "wallet.adjust",

  API_KEY_CREATE: "api_key.create",
  API_KEY_READ: "api_key.read",
  API_KEY_REVOKE: "api_key.revoke",

  WEBHOOK_MANAGE: "webhook.manage",

  FRAUD_READ: "fraud.read",
  FRAUD_REVIEW: "fraud.review",

  AUDIT_READ: "audit.read",

  PROVIDER_MANAGE: "provider.manage",
  SIMULATOR_MANAGE: "simulator.manage",
  PRICING_MANAGE: "pricing.manage",
  SYSTEM_MANAGE: "system.manage",

  ADMIN_ORGANIZATIONS_MANAGE: "admin.organizations.manage",
  ADMIN_USERS_MANAGE: "admin.users.manage",

  ORGANIZATION_EXPORT_DATA: "organization.export_data",
  ORGANIZATION_DELETE: "organization.delete",

  PLATFORM_ROLES_MANAGE: "platform.roles.manage",
} as const;

export type PermissionCode = (typeof PermissionCode)[keyof typeof PermissionCode];

export const ALL_PERMISSION_CODES: PermissionCode[] = Object.values(PermissionCode);

/**
 * Permission codes a platform-only actor grants itself — never assignable to an
 * organization's own custom role (see modules/roles). Two different reasons land a
 * code here:
 *
 *  1. Genuinely cross-tenant or infrastructure-level (ADMIN_*, PROVIDER_MANAGE,
 *     SIMULATOR_MANAGE, PRICING_MANAGE) — an organization has no business granting
 *     access to something that isn't scoped to it at all.
 *  2. Independent-verification actions (DOCUMENTS_REVIEW, SENDER_ID_REVIEW/APPROVE/
 *     REJECT/MANAGE_LIFECYCLE) — the entire point is that the platform, not the
 *     organization itself, attests to these; self-granting would defeat that.
 *  3. Service functions that check only `assertPermission` for this code, with no
 *     independent `assertOrganizationAccess` re-check of their own (WALLET_ADJUST,
 *     FRAUD_READ/REVIEW) — they rely on always being reached through a route that
 *     also calls `requirePlatformAdmin`. Letting a custom role grant one of these
 *     would let an org's own admin bypass that route-level gate entirely, e.g.
 *     adjusting *any* organization's wallet balance, not just their own.
 *
 * modules/roles/service.ts enforces this server-side on every create/update — the
 * frontend picker filtering to this same list is a UX convenience, not the boundary.
 */
const PLATFORM_ONLY_PERMISSION_CODES: PermissionCode[] = [
  PermissionCode.DOCUMENTS_REVIEW,
  PermissionCode.SENDER_ID_REVIEW,
  PermissionCode.SENDER_ID_APPROVE,
  PermissionCode.SENDER_ID_REJECT,
  PermissionCode.SENDER_ID_MANAGE_LIFECYCLE,
  PermissionCode.WALLET_ADJUST,
  PermissionCode.FRAUD_READ,
  PermissionCode.FRAUD_REVIEW,
  PermissionCode.PROVIDER_MANAGE,
  PermissionCode.SIMULATOR_MANAGE,
  PermissionCode.PRICING_MANAGE,
  PermissionCode.ADMIN_ORGANIZATIONS_MANAGE,
  PermissionCode.ADMIN_USERS_MANAGE,
  PermissionCode.SYSTEM_MANAGE,
  PermissionCode.PLATFORM_ROLES_MANAGE,
];

export const ORG_ASSIGNABLE_PERMISSION_CODES: PermissionCode[] = ALL_PERMISSION_CODES.filter(
  (code) => !PLATFORM_ONLY_PERMISSION_CODES.includes(code),
);
