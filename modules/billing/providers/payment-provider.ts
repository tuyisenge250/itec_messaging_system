/**
 * Payment exists only to purchase SMS credits — this is not a general
 * payment gateway. Business code depends only on this interface, never on a
 * specific provider's SDK, so a RealPaymentProvider can be added later
 * without touching modules/billing/payment-service.ts.
 */
export type PaymentOutcomeStatus =
  | "SUCCEEDED"
  | "FAILED"
  | "TIMEOUT"
  | "CANCELLED"
  | "INSUFFICIENT_FUNDS"
  | "PROVIDER_UNAVAILABLE";

export interface ChargeRequest {
  amountMinorUnits: number;
  currency: string;
  /** Our PaymentIntent id — used as the idempotency/tracing key with the provider. */
  reference: string;
  /** Sandbox-only: force a specific outcome for testing. Ignored by a real provider. */
  simulateOutcome?: PaymentOutcomeStatus;
}

export interface ChargeResult {
  status: PaymentOutcomeStatus;
  providerReference: string;
  raw: unknown;
}

export interface PaymentProvider {
  charge(request: ChargeRequest): Promise<ChargeResult>;
}
