import { providerConfigRepository } from "./provider-config-repository";
import { SimulatorSmsProvider } from "@/modules/simulator/simulator-sms-provider";
import type { SmsProvider } from "./sms-provider";
import type { Environment, ProviderConfig } from "@/generated/prisma/client";

/**
 * The ONLY place that maps a provider code to a concrete adapter class.
 * Everywhere else depends on the SmsProvider interface — this is what
 * "configuration-driven provider resolution instead of if/else scattered
 * through business logic" (AGENTS brief #47) means in practice. Adding
 * MtnSmsProvider later is one more `case` here, nothing else.
 */
export async function resolveSmsProvider(environment: Environment): Promise<{ provider: SmsProvider; config: ProviderConfig }> {
  const config = await providerConfigRepository.findActive("SMS", environment);
  if (!config) {
    throw new Error(`No active SMS ProviderConfig for environment ${environment} — check the simulator seed data`);
  }

  switch (config.providerCode) {
    case "simulator":
      return { provider: new SimulatorSmsProvider(), config };
    default:
      throw new Error(
        `Unknown SMS provider code "${config.providerCode}". Implement an adapter against the SmsProvider ` +
          `interface (modules/providers/sms-provider.ts) and add a case for it here.`,
      );
  }
}
