import { fraudRepository } from "./repository";
import { checkRateLimitBy } from "@/infrastructure/redis/rate-limiter";
import { recordAuditEvent } from "@/modules/audit/service";
import { notifyAllPlatformAdmins } from "@/modules/notifications/service";
import { AppError } from "@/shared/errors/app-error";
import { ErrorCode } from "@/shared/errors/error-codes";
import { assertPermission, requirePlatformAdmin } from "@/modules/auth/services/authorization-service";
import { PermissionCode } from "@/shared/constants/permissions";
import type { ActorContext } from "@/shared/types/actor-context";
import type { FraudRuleType } from "@/generated/prisma/client";

const WINDOW_SECONDS: Partial<Record<FraudRuleType, number>> = {
  REQUESTS_PER_MINUTE: 60,
  SMS_PER_MINUTE: 60,
  SMS_PER_HOUR: 60 * 60,
  SMS_PER_DAY: 24 * 60 * 60,
};

/**
 * SMS-per-minute/hour/day + org quota checks, backed by Redis counters keyed
 * per rule so an admin can add/adjust a FraudRule row without a deploy. Only
 * the rule types this send path actually needs are enforced here
 * (destination velocity and spending limit are recorded as FraudRule rows
 * and can be seeded/managed, but aren't wired into an enforcement point yet
 * — see docs/architecture.md "Known limitations").
 */
export async function checkSmsSendLimits(params: {
  organizationId: string;
  apiKeyId?: string;
  ipAddress?: string;
  recipientCount: number;
}): Promise<void> {
  const ruleTypes: FraudRuleType[] = ["SMS_PER_MINUTE", "SMS_PER_HOUR", "SMS_PER_DAY", "ORGANIZATION_QUOTA"];

  for (const ruleType of ruleTypes) {
    const rules = await fraudRepository.listEnabledRulesByType(ruleType, params.organizationId);
    for (const rule of rules) {
      const windowSeconds = rule.windowSeconds ?? WINDOW_SECONDS[ruleType] ?? 60;
      const key = `fraud:${rule.id}:org:${params.organizationId}`;
      const result = await checkRateLimitBy(key, params.recipientCount, rule.thresholdValue, windowSeconds);

      if (!result.allowed) {
        const description = `Exceeded ${rule.name} (${ruleType}): threshold ${rule.thresholdValue} per ${windowSeconds}s`;
        await fraudRepository.createEvent({
          organization: { connect: { id: params.organizationId } },
          rule: { connect: { id: rule.id } },
          eventType: "sms_rate_limit_exceeded",
          severity: rule.action === "BLOCK" ? "HIGH" : "MEDIUM",
          description,
          metadata: { recipientCount: params.recipientCount, apiKeyId: params.apiKeyId },
          ipAddress: params.ipAddress,
        });

        if (rule.action === "BLOCK") {
          // Only the consequential case (a send was actually blocked) pages platform
          // admins — a THROTTLE/MEDIUM event is logged for visibility but isn't urgent.
          await notifyAllPlatformAdmins("FRAUD", "Fraud rule blocked a send", description, {
            organizationId: params.organizationId,
          });
          throw AppError.rateLimited(`Sending limit exceeded: ${rule.name}`);
        }
        if (rule.action === "FLAG_FOR_REVIEW") {
          throw AppError.of(ErrorCode.FRAUD_REVIEW_REQUIRED, "This send has been flagged for manual review", 403);
        }
        // THROTTLE: allowed through, but logged as a fraud event for visibility.
      }
    }
  }
}

export async function listFraudEvents(
  actor: ActorContext,
  status?: "OPEN" | "REVIEWING" | "RESOLVED" | "DISMISSED",
  cursor?: string,
  organizationId?: string,
) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.FRAUD_READ);
  return fraudRepository.listEvents({ status, organizationId, take: 25, cursor });
}

export async function reviewFraudEvent(
  actor: ActorContext,
  id: string,
  decision: "RESOLVED" | "DISMISSED",
  notes?: string,
) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.FRAUD_REVIEW);
  if (!actor.userId) throw AppError.unauthenticated();

  const event = await fraudRepository.findEventById(id);
  if (!event) throw AppError.notFound();

  const updated = await fraudRepository.reviewEvent(id, decision, actor.userId, notes);
  await recordAuditEvent({
    actor,
    action: "fraud_event.reviewed",
    resourceType: "FraudEvent",
    resourceId: id,
    organizationId: event.organizationId,
    metadata: { decision, notes },
  });
  return updated;
}

export async function listFraudRules(actor: ActorContext) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.FRAUD_READ);
  return fraudRepository.listAll();
}
