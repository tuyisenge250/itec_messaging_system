/**
 * Provider-independent SMS sending contract. Business logic (messaging
 * service, workers) depends only on this interface — never on a specific
 * provider's request/response shape — so MtnSmsProvider/AirtelSmsProvider
 * can be added later without touching modules/messaging.
 *
 * `sendSms` mirrors how a real telecom API behaves: it returns an immediate
 * accept/reject outcome, not final delivery. Final delivery arrives later,
 * out of band, via that provider's webhook hitting
 * POST /api/webhooks/:provider (see modules/webhooks) — the simulator plays
 * both roles (see modules/simulator) so the same pipeline can be exercised
 * end to end without a real telecom integration.
 */
export interface SendSmsRequest {
  senderId: string;
  recipient: string;
  message: string;
  clientReference?: string;
  /** Context the simulator's scenario matcher needs — a real adapter ignores this. */
  simulatorContext?: {
    environment: "SANDBOX" | "PRODUCTION";
    organizationId: string;
    recipientId: string;
    apiKeyId?: string;
    /** 1-based attempt number for this recipient — lets the simulator play deterministic "fails N times then succeeds" retry scenarios. */
    attemptNumber: number;
  };
}

export type ProviderCallStatus = "ACCEPTED" | "REJECTED" | "TIMEOUT" | "ERROR";

export interface SendSmsResult {
  status: ProviderCallStatus;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  raw: unknown;
}

export type DeliveryStatus = "PENDING" | "DELIVERED" | "FAILED" | "EXPIRED" | "UNDELIVERED";

export interface DeliveryStatusResult {
  status: DeliveryStatus;
  raw: unknown;
}

export interface SmsProvider {
  sendSms(request: SendSmsRequest): Promise<SendSmsResult>;
  getDeliveryStatus(providerMessageId: string): Promise<DeliveryStatusResult>;
}
