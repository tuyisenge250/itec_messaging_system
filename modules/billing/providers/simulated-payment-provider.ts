import { randomUUID } from "node:crypto";
import type { PaymentProvider, ChargeRequest, ChargeResult } from "./payment-provider";

/**
 * Payment completion is simulated synchronously (unlike the SMS simulator,
 * which is deliberately asynchronous — see modules/simulator). A real
 * payment provider would typically also be async (redirect + webhook), but
 * that complexity doesn't add architectural value here since the important
 * pattern (idempotent, exactly-once wallet credit) is already exercised by
 * modules/billing/payment-service.ts regardless of how the outcome arrives.
 */
export class SimulatedPaymentProvider implements PaymentProvider {
  async charge(request: ChargeRequest): Promise<ChargeResult> {
    const status = request.simulateOutcome ?? "SUCCEEDED";
    return {
      status,
      providerReference: `sim_pay_${randomUUID()}`,
      raw: { simulated: true, amountMinorUnits: request.amountMinorUnits, currency: request.currency, status },
    };
  }
}
