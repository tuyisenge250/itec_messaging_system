import { prisma } from "@/infrastructure/database/prisma";
import { env } from "@/infrastructure/config/env";
import { organizationRepository } from "./repository";
import { authRepository } from "@/modules/auth/repository";
import { assertValidOrganizationTransition } from "./state-machine";
import { provisionSandboxOnboarding } from "./onboarding-service";
import { resolveAssignableRole } from "@/modules/roles/service";
import { notifyAllPlatformAdmins } from "@/modules/notifications/service";
import { hashPassword, generateTemporaryPassword } from "@/modules/auth/services/password-service";
import { revokeAllSessionsForUser } from "@/modules/auth/services/session-service";
import {
  assertPermission,
  assertOrganizationAccess,
  assertResourceBelongsToOrganization,
  requirePlatformAdmin,
} from "@/modules/auth/services/authorization-service";
import { recordAuditEvent } from "@/modules/audit/service";
import { checkRateLimit } from "@/infrastructure/redis/rate-limiter";
import { AppError } from "@/shared/errors/app-error";
import { PermissionCode } from "@/shared/constants/permissions";
import { RoleName } from "@/shared/constants/roles";
import type { ActorContext } from "@/shared/types/actor-context";
import type { z } from "zod";
import type { createOrganizationSchema, updateOrganizationSchema, createMemberSchema } from "./validation";
import type { OrganizationStatus } from "@/generated/prisma/client";

export async function createOrganization(actor: ActorContext, input: z.infer<typeof createOrganizationSchema>) {
  if (!actor.userId) throw AppError.unauthenticated();

  const adminRole = await authRepository.findRoleByName(RoleName.ADMIN);
  if (!adminRole) throw AppError.internal("ADMIN role is not seeded");

  const { organization, sandbox } = await prisma.$transaction(async (tx) => {
    const org = await organizationRepository.create({ ...input }, tx);
    await organizationRepository.createMembership(
      { organizationId: org.id, userId: actor.userId!, roleId: adminRole.id, status: "ACTIVE" },
      tx,
    );
    await organizationRepository.ensureWallet(org.id, "SANDBOX", tx);

    // Frictionless sandbox onboarding — no RURA approval, no documents, no real
    // payment required to start testing. See docs/sandbox.md.
    const sandboxOnboarding = env.SANDBOX_ENABLED
      ? await provisionSandboxOnboarding(tx, org.id, org.legalName, actor.userId!)
      : null;

    return { organization: org, sandbox: sandboxOnboarding };
  });

  await recordAuditEvent({
    actor,
    action: "organization.create",
    resourceType: "Organization",
    resourceId: organization.id,
    organizationId: organization.id,
    metadata: sandbox ? { sandboxSenderId: sandbox.senderId.value, sandboxApiKeyId: sandbox.apiKey.record.id } : undefined,
  });

  return {
    ...organization,
    sandboxOnboarding: sandbox
      ? {
          senderId: sandbox.senderId,
          initialCreditMinorUnits: sandbox.initialCreditMinorUnits,
          apiKey: { id: sandbox.apiKey.record.id, name: sandbox.apiKey.record.name, plaintextToken: sandbox.apiKey.plaintextToken },
        }
      : null,
  };
}

export async function getOrganization(actor: ActorContext, organizationId: string) {
  await assertPermission(actor, PermissionCode.ORGANIZATION_READ);
  assertOrganizationAccess(actor, organizationId);

  const organization = await organizationRepository.findById(organizationId);
  if (!organization) throw AppError.notFound();
  return organization;
}

export async function updateOrganization(
  actor: ActorContext,
  organizationId: string,
  input: z.infer<typeof updateOrganizationSchema>,
) {
  await assertPermission(actor, PermissionCode.ORGANIZATION_UPDATE);
  assertOrganizationAccess(actor, organizationId);

  const existing = await organizationRepository.findById(organizationId);
  assertResourceBelongsToOrganization(existing?.id, organizationId);

  const updated = await organizationRepository.update(organizationId, input);

  await recordAuditEvent({
    actor,
    action: "organization.update",
    resourceType: "Organization",
    resourceId: organizationId,
    organizationId,
    metadata: input,
  });

  return updated;
}

export async function submitOrganizationForReview(actor: ActorContext, organizationId: string) {
  await assertPermission(actor, PermissionCode.ORGANIZATION_UPDATE);
  assertOrganizationAccess(actor, organizationId);

  const organization = await organizationRepository.findById(organizationId);
  if (!organization) throw AppError.notFound();
  assertValidOrganizationTransition(organization.status, "UNDER_REVIEW");

  const updated = await organizationRepository.updateStatus(organizationId, "UNDER_REVIEW");
  await recordAuditEvent({
    actor,
    action: "organization.submitted_for_review",
    resourceType: "Organization",
    resourceId: organizationId,
    organizationId,
  });
  await notifyAllPlatformAdmins(
    "SYSTEM",
    "Organization submitted for review",
    `${organization.legalName} has been submitted for review.`,
    { organizationId },
  );
  return updated;
}

async function transitionAsAdmin(
  actor: ActorContext,
  organizationId: string,
  to: OrganizationStatus,
  action: string,
  notes?: string,
) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.ADMIN_ORGANIZATIONS_MANAGE);

  const organization = await organizationRepository.findById(organizationId);
  if (!organization) throw AppError.notFound();
  assertValidOrganizationTransition(organization.status, to);

  const updated = await organizationRepository.updateStatus(organizationId, to);

  if (to === "ACTIVE") {
    await organizationRepository.ensureWallet(organizationId, "PRODUCTION");
  }

  await recordAuditEvent({
    actor,
    action,
    resourceType: "Organization",
    resourceId: organizationId,
    organizationId,
    metadata: notes ? { notes } : undefined,
  });

  return updated;
}

export const approveOrganization = (actor: ActorContext, organizationId: string, notes?: string) =>
  transitionAsAdmin(actor, organizationId, "VERIFIED", "organization.approved", notes);

export const rejectOrganization = (actor: ActorContext, organizationId: string, notes?: string) =>
  transitionAsAdmin(actor, organizationId, "REJECTED", "organization.rejected", notes);

export const activateOrganization = (actor: ActorContext, organizationId: string, notes?: string) =>
  transitionAsAdmin(actor, organizationId, "ACTIVE", "organization.activated", notes);

export const suspendOrganization = (actor: ActorContext, organizationId: string, notes?: string) =>
  transitionAsAdmin(actor, organizationId, "SUSPENDED", "organization.suspended", notes);

export const reactivateOrganization = (actor: ActorContext, organizationId: string, notes?: string) =>
  transitionAsAdmin(actor, organizationId, "ACTIVE", "organization.reactivated", notes);

export async function listOrganizationsForAdmin(actor: ActorContext, status?: OrganizationStatus, cursor?: string) {
  requirePlatformAdmin(actor);
  return organizationRepository.list({ status, take: 25, cursor });
}

export async function getOrganizationForAdmin(actor: ActorContext, organizationId: string) {
  requirePlatformAdmin(actor);
  const organization = await organizationRepository.findByIdWithDetails(organizationId);
  if (!organization) throw AppError.notFound();
  return organization;
}

/**
 * Records the discrete, audit-worthy moment a platform admin starts "viewing
 * as" this organization (app/_lib/acting-organization.ts) — the actual access
 * on every subsequent request goes through the existing X-Organization-Id
 * resolution in getSessionActorContext, which already bypasses for
 * isPlatformAdmin; this is deliberately just the one-time marker, not a
 * per-request audit trail.
 */
export async function startActingAsOrganization(actor: ActorContext, organizationId: string) {
  requirePlatformAdmin(actor);

  const limit = await checkRateLimit(`act-as:user:${actor.userId}`, 30, 60 * 60);
  if (!limit.allowed) throw AppError.rateLimited("Too many organization switches. Try again later.");

  const organization = await organizationRepository.findById(organizationId);
  if (!organization) throw AppError.notFound();

  await recordAuditEvent({
    actor,
    action: "organization.admin_view_started",
    resourceType: "Organization",
    resourceId: organizationId,
    organizationId,
  });

  return { organizationId: organization.id, organizationName: organization.legalName };
}

// --- Members ---

export async function listMembers(actor: ActorContext, organizationId: string) {
  await assertPermission(actor, PermissionCode.MEMBERS_READ);
  assertOrganizationAccess(actor, organizationId);
  return organizationRepository.listMembers(organizationId);
}

/**
 * Creates a team member directly rather than requiring them to self-register first.
 * If the email already belongs to an account, that existing account is attached to
 * the organization (never a password reset — it isn't this org's credential to set).
 * Otherwise a brand-new account is created on the spot with a generated one-time
 * password, returned once in the response for the admin to hand off out of band —
 * mirrors how a sandbox API key's plaintext token is only ever shown once.
 */
export async function createMember(
  actor: ActorContext,
  organizationId: string,
  input: z.infer<typeof createMemberSchema>,
) {
  await assertPermission(actor, PermissionCode.MEMBERS_CREATE);
  assertOrganizationAccess(actor, organizationId);

  const role = await resolveAssignableRole(organizationId, input.roleId);
  const existingUser = await authRepository.findUserByEmail(input.email);

  if (existingUser) {
    // (organizationId, userId) is unique regardless of status, so a previously-removed
    // member already has a row here — reactivate it instead of creating a duplicate
    // (which would otherwise hit that unique constraint and fail as an unhandled error).
    const existingMembership = await organizationRepository.findMembershipByOrgAndUser(organizationId, existingUser.id);
    if (existingMembership && existingMembership.status !== "REMOVED") {
      throw AppError.conflict("This user is already a member of this organization");
    }

    const membership = existingMembership
      ? await organizationRepository.reactivateMembership(existingMembership.id, role.id)
      : await organizationRepository.createMembership({ organizationId, userId: existingUser.id, roleId: role.id, status: "ACTIVE" });

    await recordAuditEvent({
      actor,
      action: "organization.member_added",
      resourceType: "OrganizationMembership",
      resourceId: membership.id,
      organizationId,
      metadata: { email: input.email, roleId: role.id, roleName: role.name, accountCreated: false },
    });

    return { membership, temporaryPassword: null };
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const membership = await prisma.$transaction(async (tx) => {
    const user = await authRepository.createUser({ email: input.email, passwordHash, name: input.name }, tx);
    return organizationRepository.createMembership({ organizationId, userId: user.id, roleId: role.id, status: "ACTIVE" }, tx);
  });

  await recordAuditEvent({
    actor,
    action: "organization.member_created",
    resourceType: "OrganizationMembership",
    resourceId: membership.id,
    organizationId,
    metadata: { email: input.email, roleId: role.id, roleName: role.name, accountCreated: true },
  });

  return { membership, temporaryPassword };
}

/**
 * Org-admin-initiated password reset for one of this organization's own members —
 * the org-scoped counterpart to auth-service.ts::adminResetPassword. Refused when the
 * member also belongs to another organization: a shared login is not this org's
 * credential to reset unilaterally, since doing so would also lock out (or hijack
 * access to) the other organization. That edge case still goes through the existing
 * platform-admin reset path.
 */
export async function resetMemberPassword(actor: ActorContext, organizationId: string, membershipId: string) {
  await assertPermission(actor, PermissionCode.MEMBERS_UPDATE);
  assertOrganizationAccess(actor, organizationId);

  const membership = await organizationRepository.findMembershipById(membershipId);
  assertResourceBelongsToOrganization(membership?.organizationId, organizationId);
  if (membership!.status !== "ACTIVE") {
    throw AppError.conflict("Only active members can have their password reset");
  }

  const otherMemberships = await organizationRepository.countOtherOrganizationMemberships(membership!.userId, organizationId);
  if (otherMemberships > 0) {
    throw AppError.conflict("This member also belongs to another organization — ask a platform administrator to reset their password");
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  await authRepository.updatePasswordHash(membership!.userId, passwordHash);
  await revokeAllSessionsForUser(membership!.userId);

  await recordAuditEvent({
    actor,
    action: "organization.member_password_reset",
    resourceType: "OrganizationMembership",
    resourceId: membershipId,
    organizationId,
  });

  return { temporaryPassword };
}

export async function updateMemberRole(actor: ActorContext, organizationId: string, membershipId: string, roleId: string) {
  await assertPermission(actor, PermissionCode.MEMBERS_UPDATE);
  assertOrganizationAccess(actor, organizationId);

  const membership = await organizationRepository.findMembershipById(membershipId);
  assertResourceBelongsToOrganization(membership?.organizationId, organizationId);

  const roleRecord = await resolveAssignableRole(organizationId, roleId);

  // Same protection as removeMember below: demoting the organization's last
  // admin away from ADMIN would leave no one able to manage membership/roles
  // at all (short of a platform admin stepping in) — refuse it, same as removal.
  // Scoped specifically to the global ADMIN role, since that's what every
  // organization's creator is bootstrapped into — a custom role, however
  // permissive, doesn't trigger this check.
  const adminRole = await authRepository.findRoleByName(RoleName.ADMIN);
  if (adminRole && membership!.roleId === adminRole.id && roleRecord.id !== adminRole.id) {
    const activeAdmins = await organizationRepository.countActiveAdmins(organizationId, adminRole.id);
    if (activeAdmins <= 1) {
      throw AppError.conflict("Cannot change the role of the last administrator of an organization");
    }
  }

  const updated = await organizationRepository.updateMembershipRole(membershipId, roleRecord.id);
  await recordAuditEvent({
    actor,
    action: "organization.member_role_updated",
    resourceType: "OrganizationMembership",
    resourceId: membershipId,
    organizationId,
    metadata: { roleId: roleRecord.id, roleName: roleRecord.name },
  });
  return updated;
}

export async function removeMember(actor: ActorContext, organizationId: string, membershipId: string) {
  await assertPermission(actor, PermissionCode.MEMBERS_REMOVE);
  assertOrganizationAccess(actor, organizationId);

  const membership = await organizationRepository.findMembershipById(membershipId);
  assertResourceBelongsToOrganization(membership?.organizationId, organizationId);

  const adminRole = await authRepository.findRoleByName(RoleName.ADMIN);
  if (adminRole && membership!.roleId === adminRole.id) {
    const activeAdmins = await organizationRepository.countActiveAdmins(organizationId, adminRole.id);
    if (activeAdmins <= 1) {
      throw AppError.conflict("Cannot remove the last administrator of an organization");
    }
  }

  const updated = await organizationRepository.removeMembership(membershipId);
  await recordAuditEvent({
    actor,
    action: "organization.member_removed",
    resourceType: "OrganizationMembership",
    resourceId: membershipId,
    organizationId,
  });
  return updated;
}
