import { simulatorRepository } from "./repository";
import { scenarioMatches } from "./scenario-matcher";
import { requirePlatformAdmin, assertPermission } from "@/modules/auth/services/authorization-service";
import { recordAuditEvent } from "@/modules/audit/service";
import { AppError } from "@/shared/errors/app-error";
import { PermissionCode } from "@/shared/constants/permissions";
import type { ActorContext } from "@/shared/types/actor-context";
import type { z } from "zod";
import type { createScenarioSchema, updateScenarioSchema } from "./validation";

export async function createScenario(actor: ActorContext, input: z.infer<typeof createScenarioSchema>) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.SIMULATOR_MANAGE);
  if (!actor.userId) throw AppError.unauthenticated();

  const scenario = await simulatorRepository.create({
    ...input,
    createdBy: { connect: { id: actor.userId } },
  });

  await recordAuditEvent({ actor, action: "simulator.scenario_created", resourceType: "SimulatorScenario", resourceId: scenario.id });
  return scenario;
}

export async function listScenarios(actor: ActorContext) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.SIMULATOR_MANAGE);
  return simulatorRepository.list();
}

export async function getScenario(actor: ActorContext, id: string) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.SIMULATOR_MANAGE);
  const scenario = await simulatorRepository.findById(id);
  if (!scenario) throw AppError.notFound();
  return scenario;
}

export async function updateScenario(actor: ActorContext, id: string, input: z.infer<typeof updateScenarioSchema>) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.SIMULATOR_MANAGE);

  const existing = await simulatorRepository.findById(id);
  if (!existing) throw AppError.notFound();

  const updated = await simulatorRepository.update(id, input);
  await recordAuditEvent({ actor, action: "simulator.scenario_updated", resourceType: "SimulatorScenario", resourceId: id, metadata: input });
  return updated;
}

export async function deleteScenario(actor: ActorContext, id: string) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.SIMULATOR_MANAGE);

  const existing = await simulatorRepository.findById(id);
  if (!existing) throw AppError.notFound();

  await simulatorRepository.delete(id);
  await recordAuditEvent({ actor, action: "simulator.scenario_deleted", resourceType: "SimulatorScenario", resourceId: id });
}

export interface TestScenarioInput {
  phoneNumber?: string;
  senderIdValue?: string;
  organizationId?: string;
  content?: string;
}

/** Dry-runs a scenario's trigger logic against a synthetic context — no recipient, no side effects. */
export async function testScenario(actor: ActorContext, id: string, input: TestScenarioInput) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.SIMULATOR_MANAGE);

  const scenario = await simulatorRepository.findById(id);
  if (!scenario) throw AppError.notFound();

  const matched = scenarioMatches(scenario, {
    environment: scenario.environment,
    organizationId: input.organizationId ?? "",
    senderIdValue: input.senderIdValue ?? "",
    phoneNumber: input.phoneNumber ?? "",
    recipientId: "test",
    content: input.content ?? "",
  });

  return {
    matched,
    wouldResult: matched
      ? {
          initialStatus: scenario.initialProviderStatus,
          delayMs: scenario.delayMs,
          finalStatus: scenario.finalDeliveryStatus,
          errorCode: scenario.errorCode,
          errorMessage: scenario.errorMessage,
        }
      : null,
  };
}

export async function listExecutions(actor: ActorContext, cursor?: string) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.SIMULATOR_MANAGE);
  return simulatorRepository.listExecutions({ take: 50, cursor });
}
