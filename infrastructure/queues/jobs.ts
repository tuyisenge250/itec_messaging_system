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
