import { prisma } from "@/infrastructure/database/prisma";
import { messagingRepository } from "@/modules/messaging/repository";
import { dispatchWebhookEvent } from "./outbound-dispatcher";
import { logger } from "@/infrastructure/logging/logger";
import type { RecipientStatus } from "@/generated/prisma/client";

export interface ProviderDeliveryEvent {
  recipientId: string;
  providerMessageId?: string;
  finalStatus: "DELIVERED" | "FAILED" | "EXPIRED" | "UNDELIVERED";
  errorCode?: string;
  errorMessage?: string;
}

const FINAL_STATUS_MAP: Record<ProviderDeliveryEvent["finalStatus"], RecipientStatus> = {
  DELIVERED: "DELIVERED",
  FAILED: "FAILED",
  EXPIRED: "EXPIRED",
  UNDELIVERED: "FAILED",
};

/**
 * The single place that turns a delivery event — from a real provider's
 * inbound webhook (POST /api/webhooks/:provider) OR the simulator's own
 * scheduled sms-delivery job calling this directly — into a recipient
 * status update. Idempotent: a recipient already in a terminal state is a
 * no-op, so a duplicate webhook call (provider retried it, or our own
 * BullMQ job retried) can never double-apply.
 */
export async function processProviderDeliveryEvent(event: ProviderDeliveryEvent): Promise<{ applied: boolean }> {
  const recipient = await messagingRepository.findRecipientById(event.recipientId);
  if (!recipient) {
    logger.warn({ recipientId: event.recipientId }, "Delivery event for unknown recipient — ignoring");
    return { applied: false };
  }

  const TERMINAL: RecipientStatus[] = ["DELIVERED", "FAILED", "EXPIRED", "REJECTED", "CANCELLED"];
  if (TERMINAL.includes(recipient.status)) {
    logger.info({ recipientId: event.recipientId, status: recipient.status }, "Duplicate delivery event ignored");
    return { applied: false };
  }

  const newStatus = FINAL_STATUS_MAP[event.finalStatus];

  await prisma.$transaction(async (tx) => {
    await tx.messageRecipient.update({
      where: { id: recipient.id },
      data: {
        status: newStatus,
        deliveredAt: newStatus === "DELIVERED" ? new Date() : undefined,
        failedAt: newStatus === "FAILED" || newStatus === "EXPIRED" ? new Date() : undefined,
        failureCode: newStatus !== "DELIVERED" ? (event.errorCode ?? "DELIVERY_FAILED") : undefined,
        failureReason: newStatus !== "DELIVERED" ? (event.errorMessage ?? "Not delivered") : undefined,
      },
    });
    await messagingRepository.recomputeAggregateStatus(tx, recipient.messageId);
  });

  // The reservation was already consumed at SENT time (billing point = provider
  // acceptance, not final delivery — see docs/architecture.md). Final delivery
  // outcome does not move money either way.

  await dispatchWebhookEvent(recipient.organizationId, newStatus === "DELIVERED" ? "message.delivered" : "message.failed", {
    messageId: recipient.messageId,
    recipientId: recipient.id,
    phoneNumber: recipient.phoneNormalized,
    status: newStatus,
    providerMessageId: event.providerMessageId ?? recipient.providerMessageId,
    failureCode: event.errorCode,
    failureReason: event.errorMessage,
  }).catch((err) => logger.error({ err, recipientId: recipient.id }, "Failed to dispatch outbound webhook"));

  return { applied: true };
}
