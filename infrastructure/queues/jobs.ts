/**
 * Job payloads carry identifiers only, never the permanent business
 * payload — the worker always reloads the authoritative record from
 * PostgreSQL. See docs/architecture.md "Redis/BullMQ".
 */
export interface SmsSendJobData {
  recipientId: string;
}

export interface SmsDeliveryJobData {
  recipientId: string;
  providerMessageId: string;
  finalStatus: "DELIVERED" | "FAILED" | "EXPIRED" | "UNDELIVERED";
  errorCode?: string;
  errorMessage?: string;
  /** Set only by the simulator (modules/simulator/simulator-sms-provider.ts) — lets the
   * sms-delivery worker resolve the originating SimulatorExecution row. A real provider's
   * inbound webhook has no such concept and never sets this. */
  executionId?: string;
}

export interface OutboxPublishJobData {
  /** No payload needed — the worker polls PENDING OutboxEvent rows itself. */
  trigger?: "poll";
}

export interface ScheduledMessagesJobData {
  trigger?: "poll";
}

export interface ScheduledCampaignsJobData {
  trigger?: "poll";
}

export interface WebhookDispatchJobData {
  webhookDeliveryId: string;
}
