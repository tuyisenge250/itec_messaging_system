import { Worker } from "bullmq";
import { createBullMqConnection } from "@/infrastructure/redis/client";
import { QueueName } from "@/infrastructure/queues/queue-names";
import { processProviderDeliveryEvent } from "@/modules/webhooks/inbound-processor";
import { simulatorRepository } from "@/modules/simulator/repository";
import { logger } from "@/infrastructure/logging/logger";
import { env } from "@/infrastructure/config/env";
import type { SmsDeliveryJobData } from "@/infrastructure/queues/jobs";

/**
 * The actual job body, extracted so it's callable directly from tests without
 * needing a live BullMQ worker/delay — same pattern as
 * modules/campaigns/service.ts::processDueCampaigns and
 * modules/messaging/service.ts::processDueScheduledMessages.
 */
export async function processSmsDeliveryJob(data: SmsDeliveryJobData): Promise<void> {
  await processProviderDeliveryEvent({
    recipientId: data.recipientId,
    providerMessageId: data.providerMessageId,
    finalStatus: data.finalStatus,
    errorCode: data.errorCode,
    errorMessage: data.errorMessage,
  });

  // Simulator-only bookkeeping (Admin -> Simulator -> Executions) — never
  // allowed to affect the real delivery pipeline above, which has already
  // committed by this point.
  if (data.executionId) {
    await simulatorRepository.resolveExecution(data.executionId, data.finalStatus).catch((err) => {
      logger.error({ err, executionId: data.executionId }, "Failed to resolve simulator execution");
    });
  }
}

/**
 * Fires after the simulator's configured delay. This is the simulator
 * "calling its own webhook" — see modules/simulator/simulator-sms-provider.ts
 * and docs/architecture.md for why this calls the shared processor function
 * directly instead of making an HTTP round-trip to POST /api/webhooks/simulator.
 */
export function startSmsDeliveryWorker(): Worker<SmsDeliveryJobData> {
  const worker = new Worker<SmsDeliveryJobData>(
    QueueName.SMS_DELIVERY,
    async (job) => processSmsDeliveryJob(job.data),
    { connection: createBullMqConnection(), concurrency: env.WORKER_CONCURRENCY_SMS_DELIVERY },
  );

  worker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id, recipientId: job?.data.recipientId }, "sms-delivery job failed");
  });
  worker.on("error", (err) => logger.error({ err }, "sms-delivery worker error"));

  return worker;
}
