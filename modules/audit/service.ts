import type { Prisma } from "@/generated/prisma/client";
import { auditRepository } from "./repository";
import { requirePlatformAdmin, assertPermission, assertOrganizationAccess } from "@/modules/auth/services/authorization-service";
import { PermissionCode } from "@/shared/constants/permissions";
import type { ActorContext } from "@/shared/types/actor-context";
import { logger } from "@/infrastructure/logging/logger";

export interface RecordAuditEventInput {
  actor: ActorContext;
  action: string;
  resourceType: string;
  resourceId?: string;
  organizationId?: string | null;
  metadata?: Prisma.InputJsonValue;
  tx?: Prisma.TransactionClient;
}

/**
 * Records a sensitive-operation audit event. Audit writes must never block
 * or fail the operation they're describing (an audit-log outage shouldn't
 * take down SMS sending) — errors here are logged, not thrown, unless the
 * caller explicitly wants it inside the same DB transaction (pass `tx`) so
 * the audit row is atomic with the state change it records (e.g. sender ID
 * approval + audit entry together).
 */
export async function recordAuditEvent(input: RecordAuditEventInput): Promise<void> {
  const data = {
    organizationId: input.organizationId ?? input.actor.organizationId ?? null,
    actorType: input.actor.actorType,
    actorUserId: input.actor.actorType === "USER" ? (input.actor.userId ?? null) : null,
    actorApiKeyId: input.actor.actorType === "API_KEY" ? (input.actor.apiKeyId ?? null) : null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    metadata: input.metadata,
    ipAddress: input.actor.ipAddress ?? null,
    userAgent: input.actor.userAgent ?? null,
  };

  if (input.tx) {
    await auditRepository.create(data, input.tx);
    return;
  }

  try {
    await auditRepository.create(data);
  } catch (error) {
    logger.error({ err: error, action: input.action, resourceType: input.resourceType }, "Failed to write audit event");
  }
}

export async function listAuditEvents(
  actor: ActorContext,
  params: { organizationId?: string; resourceType?: string; resourceId?: string; actorUserId?: string; cursor?: string },
) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.AUDIT_READ);
  return auditRepository.list({ ...params, take: 50 });
}

/** Org-scoped variant for the customer-facing audit log page — never crosses tenants. */
export async function listAuditEventsForOrganization(actor: ActorContext, organizationId: string, cursor?: string) {
  await assertPermission(actor, PermissionCode.AUDIT_READ);
  assertOrganizationAccess(actor, organizationId);
  return auditRepository.list({ organizationId, take: 50, cursor });
}
