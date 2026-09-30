import { Worker } from "bullmq";
import { createBullMqConnection } from "@/infrastructure/redis/client";
import { queues } from "@/infrastructure/queues/queues";
import { QueueName } from "@/infrastructure/queues/queue-names";
import { processDueScheduledMessages } from "@/modules/messaging/service";
import { logger } from "@/infrastructure/logging/logger";

const POLL_INTERVAL_MS = 15_000;

export async function startScheduledMessagesWorker(): Promise<Worker> {
  await queues.scheduledMessages.upsertJobScheduler("scheduled-messages-poll", { every: POLL_INTERVAL_MS }, { name: "poll" });

  const worker = new Worker(
    QueueName.SCHEDULED_MESSAGES,
    async () => {
      const result = await processDueScheduledMessages();
      if (result.processed > 0) {
        logger.info(result, "scheduled-messages poll cycle");
      }
    },
    { connection: createBullMqConnection(), concurrency: 1 },
  );

  worker.on("error", (err) => logger.error({ err }, "scheduled-messages worker error"));
  return worker;
}
