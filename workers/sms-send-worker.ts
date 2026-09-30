import { Worker } from "bullmq";
import { createBullMqConnection } from "@/infrastructure/redis/client";
import { QueueName } from "@/infrastructure/queues/queue-names";
import { processSmsSendJob } from "@/modules/messaging/send-processor";
import { logger } from "@/infrastructure/logging/logger";
import { env } from "@/infrastructure/config/env";
import type { SmsSendJobData } from "@/infrastructure/queues/jobs";

export function startSmsSendWorker(): Worker<SmsSendJobData> {
  const worker = new Worker<SmsSendJobData>(
    QueueName.SMS_SEND,
    async (job) => {
      await processSmsSendJob(job.data.recipientId);
    },
    { connection: createBullMqConnection(), concurrency: env.WORKER_CONCURRENCY_SMS_SEND },
  );

  worker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id, recipientId: job?.data.recipientId }, "sms-send job failed");
  });
  worker.on("error", (err) => logger.error({ err }, "sms-send worker error"));

  return worker;
}
