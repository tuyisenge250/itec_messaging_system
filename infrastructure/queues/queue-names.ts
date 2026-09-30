export const QueueName = {
  SMS_SEND: "sms-send",
  SMS_DELIVERY: "sms-delivery",
  OUTBOX_PUBLISH: "outbox-publish",
  SCHEDULED_MESSAGES: "scheduled-messages",
  SCHEDULED_CAMPAIGNS: "scheduled-campaigns",
  WEBHOOK_DISPATCH: "webhook-processing",
} as const;

export type QueueName = (typeof QueueName)[keyof typeof QueueName];
