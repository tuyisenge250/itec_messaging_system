import { prisma } from "@/infrastructure/database/prisma";
import { billingRepository } from "./repository";
import { assertPermission, requirePlatformAdmin } from "@/modules/auth/services/authorization-service";
import { recordAuditEvent } from "@/modules/audit/service";
import { AppError } from "@/shared/errors/app-error";
import { PermissionCode } from "@/shared/constants/permissions";
import type { ActorContext } from "@/shared/types/actor-context";

export async function getEffectivePricingPlan(organizationId: string) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { pricingPlan: true },
  });
  if (!organization) throw AppError.notFound("Organization not found");

  if (organization.pricingPlan?.active) return organization.pricingPlan;

  const defaultPlan = await prisma.pricingPlan.findFirst({ where: { isDefault: true, active: true } });
  if (!defaultPlan) throw AppError.internal("No default pricing plan is configured");
  return defaultPlan;
}

export interface MessageCost {
  pricePerSegmentMinorUnits: number;
  segmentCount: number;
  totalCostMinorUnits: number;
  currency: string;
}

export async function calculateMessageCost(organizationId: string, segmentCount: number): Promise<MessageCost> {
  const plan = await getEffectivePricingPlan(organizationId);
  return {
    pricePerSegmentMinorUnits: plan.pricePerSegmentMinorUnits,
    segmentCount,
    totalCostMinorUnits: plan.pricePerSegmentMinorUnits * segmentCount,
    currency: plan.currency,
  };
}

export function listPricingPlans() {
  return prisma.pricingPlan.findMany({ where: { active: true }, orderBy: { pricePerSegmentMinorUnits: "asc" } });
}

export interface PricingPlanInput {
  name: string;
  pricePerSegmentMinorUnits: number;
  currency?: string;
  isDefault?: boolean;
  active?: boolean;
  effectiveFrom?: string;
  effectiveTo?: string;
}

export type UpdatePricingPlanInput = Partial<PricingPlanInput>;

export async function listPricingPlansForAdmin(actor: ActorContext) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.PRICING_MANAGE);
  return billingRepository.listAllPricingPlans();
}

export async function createPricingPlan(actor: ActorContext, input: PricingPlanInput) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.PRICING_MANAGE);

  const plan = await prisma.$transaction(async (tx) => {
    const created = await billingRepository.createPricingPlan(
      {
        name: input.name,
        pricePerSegmentMinorUnits: input.pricePerSegmentMinorUnits,
        currency: input.currency,
        isDefault: input.isDefault ?? false,
        active: input.active ?? true,
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : undefined,
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : undefined,
      },
      tx,
    );
    // isDefault is an application-level invariant (no partial-unique-index at the DB
    // level enforces "only one default plan"), so clear every other plan explicitly.
    if (created.isDefault) {
      await billingRepository.clearOtherDefaultPlans(created.id, tx);
    }
    return created;
  });

  await recordAuditEvent({
    actor,
    action: "pricing_plan.created",
    resourceType: "PricingPlan",
    resourceId: plan.id,
    metadata: { name: input.name, isDefault: plan.isDefault },
  });

  return plan;
}

export async function updatePricingPlan(actor: ActorContext, id: string, input: UpdatePricingPlanInput) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.PRICING_MANAGE);

  const existing = await billingRepository.findPricingPlanById(id);
  if (!existing) throw AppError.notFound();

  const plan = await prisma.$transaction(async (tx) => {
    const updated = await billingRepository.updatePricingPlan(
      id,
      {
        name: input.name,
        pricePerSegmentMinorUnits: input.pricePerSegmentMinorUnits,
        currency: input.currency,
        isDefault: input.isDefault,
        active: input.active,
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : undefined,
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : undefined,
      },
      tx,
    );
    if (input.isDefault) {
      await billingRepository.clearOtherDefaultPlans(id, tx);
    }
    return updated;
  });

  await recordAuditEvent({
    actor,
    action: "pricing_plan.updated",
    resourceType: "PricingPlan",
    resourceId: id,
    metadata: { changed: Object.keys(input) },
  });

  return plan;
}
