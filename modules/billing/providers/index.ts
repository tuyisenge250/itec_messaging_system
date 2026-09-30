import type { PaymentProvider } from "./payment-provider";
import { SimulatedPaymentProvider } from "./simulated-payment-provider";
import { env } from "@/infrastructure/config/env";

function createPaymentProvider(): PaymentProvider {
  switch (env.PAYMENT_PROVIDER) {
    case "simulator":
      return new SimulatedPaymentProvider();
    case "real":
      throw new Error(
        "PAYMENT_PROVIDER=real is not implemented yet. Implement it against the PaymentProvider interface " +
          "in modules/billing/providers/payment-provider.ts and wire it in here.",
      );
  }
}

export const paymentProvider: PaymentProvider = createPaymentProvider();
export type { PaymentProvider, ChargeRequest, ChargeResult, PaymentOutcomeStatus } from "./payment-provider";
