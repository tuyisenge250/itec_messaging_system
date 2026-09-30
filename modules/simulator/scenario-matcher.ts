import { simulatorRepository } from "./repository";
import type { SimulatorScenario, Environment } from "@/generated/prisma/client";

export interface ScenarioMatchContext {
  environment: Environment;
  organizationId: string;
  senderIdValue: string;
  phoneNumber: string;
  recipientId: string;
  apiKeyId?: string;
  content: string;
}

/** Highest-priority enabled scenario (in the matching environment) is tested first; the first match wins. */
export async function matchScenario(ctx: ScenarioMatchContext): Promise<SimulatorScenario | null> {
  const scenarios = await simulatorRepository.listEnabledByPriority(ctx.environment);

  for (const scenario of scenarios) {
    if (scenarioMatches(scenario, ctx)) return scenario;
  }
  return null;
}

export function scenarioMatches(scenario: SimulatorScenario, ctx: ScenarioMatchContext): boolean {
  switch (scenario.triggerType) {
    case "PHONE_NUMBER":
      return scenario.triggerValue === ctx.phoneNumber;
    case "SENDER_ID":
      return scenario.triggerValue === ctx.senderIdValue;
    case "ORGANIZATION":
      return scenario.triggerValue === ctx.organizationId;
    case "MESSAGE_ID":
      return scenario.triggerValue === ctx.recipientId;
    case "API_KEY":
      return Boolean(ctx.apiKeyId) && scenario.triggerValue === ctx.apiKeyId;
    case "MESSAGE_CONTENT":
      return Boolean(scenario.triggerValue) && ctx.content.includes(scenario.triggerValue!);
    case "RANDOM_PERCENTAGE":
      return Math.random() * 100 < (scenario.probabilityPercent ?? 0);
    default:
      return false;
  }
}
