import { prisma } from "@/infrastructure/database/prisma";
import { env } from "@/infrastructure/config/env";
import { AppError } from "@/shared/errors/app-error";
import type { ActorContext } from "@/shared/types/actor-context";

/**
 * Customer-facing sandbox reference info — distinct from modules/simulator,
 * which is the platform-admin CRUD surface for scenario rows. Nothing here
 * is org-scoped or sensitive: it's the same documentation table every
 * sandbox organization sees, generated from the actual seeded/admin-managed
 * SimulatorScenario rows rather than hardcoded in the UI (see
 * app/dashboard/sandbox/page.tsx, docs/sandbox.md).
 */
export async function listSandboxTestNumbers(actor: ActorContext) {
  if (!actor.userId && !actor.apiKeyId) throw AppError.unauthenticated();

  const scenarios = await prisma.simulatorScenario.findMany({
    where: { environment: "SANDBOX", triggerType: "PHONE_NUMBER", enabled: true, triggerValue: { not: null } },
    orderBy: { triggerValue: "asc" },
    select: {
      triggerValue: true,
      name: true,
      description: true,
      initialProviderStatus: true,
      finalDeliveryStatus: true,
      delayMs: true,
    },
  });

  return {
    enabled: env.SANDBOX_ENABLED,
    numberPrefix: `+250${env.SANDBOX_TEST_NUMBER_PREFIX}`,
    initialCreditMinorUnits: env.SANDBOX_INITIAL_CREDIT_MINOR_UNITS,
    defaultDeliveryDelayMs: env.SANDBOX_DEFAULT_DELIVERY_DELAY_MS,
    senderPrefix: env.SANDBOX_DEFAULT_SENDER_PREFIX,
    numbers: scenarios.map((s) => ({
      phoneNumber: s.triggerValue!,
      name: s.name,
      description: s.description,
      initialProviderStatus: s.initialProviderStatus,
      finalDeliveryStatus: s.finalDeliveryStatus,
      delayMs: s.delayMs,
    })),
  };
}
