import { Worker } from "bullmq";
import { createBullMqConnection } from "@/infrastructure/redis/client";
import { queues } from "@/infrastructure/queues/queues";
import { QueueName } from "@/infrastructure/queues/queue-names";
import { processDueCampaigns } from "@/modules/campaigns/service";
import { logger } from "@/infrastructure/logging/logger";

const POLL_INTERVAL_MS = 15_000;

export async function startScheduledCampaignsWorker(): Promise<Worker> {
  await queues.scheduledCampaigns.upsertJobScheduler("scheduled-campaigns-poll", { every: POLL_INTERVAL_MS }, { name: "poll" });

  const worker = new Worker(
    QueueName.SCHEDULED_CAMPAIGNS,
    async () => {
      const result = await processDueCampaigns();
      if (result.processed > 0) {
        logger.info(result, "scheduled-campaigns poll cycle");
      }
    },
    { connection: createBullMqConnection(), concurrency: 1 },
  );

  worker.on("error", (err) => logger.error({ err }, "scheduled-campaigns worker error"));
  return worker;
}
