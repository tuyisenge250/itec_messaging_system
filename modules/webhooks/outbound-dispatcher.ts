import { prisma } from "@/infrastructure/database/prisma";
import { queues } from "@/infrastructure/queues/queues";
import { logger } from "@/infrastructure/logging/logger";
import type { Prisma } from "@/generated/prisma/client";

/** Creates a WebhookDelivery row per matching, active customer webhook and enqueues dispatch. */
export async function dispatchWebhookEvent(
  organizationId: string,
  eventType: string,
  payload: Prisma.InputJsonValue,
): Promise<void> {
  const webhooks = await prisma.webhook.findMany({
    where: { organizationId, isActive: true, events: { has: eventType } },
  });

  for (const webhook of webhooks) {
    const delivery = await prisma.webhookDelivery.create({
      data: { webhookId: webhook.id, eventType, payload, status: "PENDING" },
    });

    try {
      await queues.webhookDispatch.add("dispatch", { webhookDeliveryId: delivery.id }, { jobId: delivery.id });
    } catch (error) {
      logger.error({ err: error, webhookDeliveryId: delivery.id }, "Failed to enqueue webhook dispatch — will remain PENDING");
    }
  }
}
