import { Worker } from "bullmq";
import { createBullMqConnection } from "@/infrastructure/redis/client";
import { queues } from "@/infrastructure/queues/queues";
import { QueueName } from "@/infrastructure/queues/queue-names";
import { pollAndPublishPending } from "@/modules/outbox/service";
import { logger } from "@/infrastructure/logging/logger";

const POLL_INTERVAL_MS = 5000;

export async function startOutboxPollerWorker(): Promise<Worker> {
  await queues.outboxPublish.upsertJobScheduler("outbox-poll", { every: POLL_INTERVAL_MS }, { name: "poll" });

  const worker = new Worker(
    QueueName.OUTBOX_PUBLISH,
    async () => {
      const result = await pollAndPublishPending();
      if (result.published > 0 || result.failed > 0) {
        logger.info(result, "outbox poll cycle");
      }
    },
    { connection: createBullMqConnection(), concurrency: 1 },
  );

  worker.on("error", (err) => logger.error({ err }, "outbox-poller worker error"));
  return worker;
}
