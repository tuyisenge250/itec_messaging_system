import { Worker } from "bullmq";
import { createBullMqConnection } from "@/infrastructure/redis/client";
import { QueueName } from "@/infrastructure/queues/queue-names";
import { processProviderDeliveryEvent } from "@/modules/webhooks/inbound-processor";
import { logger } from "@/infrastructure/logging/logger";
import { env } from "@/infrastructure/config/env";
import type { SmsDeliveryJobData } from "@/infrastructure/queues/jobs";

/**
 * Fires after the simulator's configured delay. This is the simulator
 * "calling its own webhook" — see modules/simulator/simulator-sms-provider.ts
 * and docs/architecture.md for why this calls the shared processor function
 * directly instead of making an HTTP round-trip to POST /api/webhooks/simulator.
 */
export function startSmsDeliveryWorker(): Worker<SmsDeliveryJobData> {
  const worker = new Worker<SmsDeliveryJobData>(
    QueueName.SMS_DELIVERY,
    async (job) => {
      await processProviderDeliveryEvent({
        recipientId: job.data.recipientId,
        providerMessageId: job.data.providerMessageId,
        finalStatus: job.data.finalStatus,
        errorCode: job.data.errorCode,
        errorMessage: job.data.errorMessage,
      });
    },
    { connection: createBullMqConnection(), concurrency: env.WORKER_CONCURRENCY_SMS_DELIVERY },
  );

  worker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id, recipientId: job?.data.recipientId }, "sms-delivery job failed");
  });
  worker.on("error", (err) => logger.error({ err }, "sms-delivery worker error"));

  return worker;
}
