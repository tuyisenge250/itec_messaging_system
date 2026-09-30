/**
 * Standalone worker process entrypoint — run with `npm run worker` (see
 * package.json). Intentionally separate from the Next.js server: BullMQ
 * Workers hold long-lived Redis connections and should scale independently
 * of the request-serving process. See docs/architecture.md "Redis/BullMQ".
 */
import "dotenv/config";
import { startSmsSendWorker } from "./sms-send-worker";
import { startSmsDeliveryWorker } from "./sms-delivery-worker";
import { startOutboxPollerWorker } from "./outbox-poller-worker";
import { startScheduledMessagesWorker } from "./scheduled-messages-worker";
import { startScheduledCampaignsWorker } from "./scheduled-campaigns-worker";
import { startWebhookDispatchWorker } from "./webhook-dispatch-worker";
import { logger } from "../infrastructure/logging/logger";
import { initSentry, captureException } from "../infrastructure/observability/sentry";

async function main() {
  initSentry();

  const workers = [
    startSmsSendWorker(),
    startSmsDeliveryWorker(),
    await startOutboxPollerWorker(),
    await startScheduledMessagesWorker(),
    await startScheduledCampaignsWorker(),
    startWebhookDispatchWorker(),
  ];

  logger.info({ queues: workers.length }, "Workers started");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down workers...");
    await Promise.all(workers.map((w) => w.close()));
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  logger.error({ err: error }, "Worker process failed to start");
  captureException(error, { context: "worker process startup" });
  process.exit(1);
});
