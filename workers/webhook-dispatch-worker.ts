import { Worker } from "bullmq";
import { createBullMqConnection } from "@/infrastructure/redis/client";
import { QueueName } from "@/infrastructure/queues/queue-names";
import { processWebhookDispatchJob } from "@/modules/webhooks/delivery-sender";
import { logger } from "@/infrastructure/logging/logger";
import type { WebhookDispatchJobData } from "@/infrastructure/queues/jobs";

export function startWebhookDispatchWorker(): Worker<WebhookDispatchJobData> {
  const worker = new Worker<WebhookDispatchJobData>(
    QueueName.WEBHOOK_DISPATCH,
    async (job) => {
      const totalAttempts = job.opts.attempts ?? 1;
      const isFinalAttempt = job.attemptsMade + 1 >= totalAttempts;
      await processWebhookDispatchJob(job.data.webhookDeliveryId, isFinalAttempt);
    },
    { connection: createBullMqConnection(), concurrency: 10 },
  );

  worker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id, webhookDeliveryId: job?.data.webhookDeliveryId }, "webhook dispatch failed");
  });
  worker.on("error", (err) => logger.error({ err }, "webhook-dispatch worker error"));

  return worker;
}
