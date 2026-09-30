import { Queue } from "bullmq";
import { createBullMqConnection } from "@/infrastructure/redis/client";
import { env } from "@/infrastructure/config/env";
import { QueueName } from "./queue-names";
import type {
  SmsSendJobData,
  SmsDeliveryJobData,
  OutboxPublishJobData,
  ScheduledMessagesJobData,
  ScheduledCampaignsJobData,
  WebhookDispatchJobData,
} from "./jobs";

const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 2000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
  removeOnFail: { age: 7 * 24 * 60 * 60 },
};

declare global {
  var __smsGatewayQueues:
    | {
        smsSend: Queue<SmsSendJobData>;
        smsDelivery: Queue<SmsDeliveryJobData>;
        outboxPublish: Queue<OutboxPublishJobData>;
        scheduledMessages: Queue<ScheduledMessagesJobData>;
        scheduledCampaigns: Queue<ScheduledCampaignsJobData>;
        webhookDispatch: Queue<WebhookDispatchJobData>;
      }
    | undefined;
}

function createQueues() {
  const connection = createBullMqConnection();
  return {
    smsSend: new Queue<SmsSendJobData>(QueueName.SMS_SEND, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS }),
    smsDelivery: new Queue<SmsDeliveryJobData>(QueueName.SMS_DELIVERY, {
      connection,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    }),
    outboxPublish: new Queue<OutboxPublishJobData>(QueueName.OUTBOX_PUBLISH, {
      connection,
      defaultJobOptions: { removeOnComplete: true, removeOnFail: { age: 24 * 60 * 60 } },
    }),
    scheduledMessages: new Queue<ScheduledMessagesJobData>(QueueName.SCHEDULED_MESSAGES, {
      connection,
      defaultJobOptions: { removeOnComplete: true, removeOnFail: { age: 24 * 60 * 60 } },
    }),
    scheduledCampaigns: new Queue<ScheduledCampaignsJobData>(QueueName.SCHEDULED_CAMPAIGNS, {
      connection,
      defaultJobOptions: { removeOnComplete: true, removeOnFail: { age: 24 * 60 * 60 } },
    }),
    webhookDispatch: new Queue<WebhookDispatchJobData>(QueueName.WEBHOOK_DISPATCH, {
      connection,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    }),
  };
}

export const queues = globalThis.__smsGatewayQueues ?? createQueues();

if (env.NODE_ENV !== "production") {
  globalThis.__smsGatewayQueues = queues;
}
