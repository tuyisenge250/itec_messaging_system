import { prisma } from "@/infrastructure/database/prisma";
import { outboxRepository } from "./repository";
import { queues } from "@/infrastructure/queues/queues";
import { logger } from "@/infrastructure/logging/logger";
import { assertPermission, requirePlatformAdmin } from "@/modules/auth/services/authorization-service";
import { recordAuditEvent } from "@/modules/audit/service";
import { AppError } from "@/shared/errors/app-error";
import { PermissionCode } from "@/shared/constants/permissions";
import type { ActorContext } from "@/shared/types/actor-context";
import type { Prisma, OutboxEvent, OutboxStatus } from "@/generated/prisma/client";

export const OutboxEventType = {
  SMS_SEND_REQUESTED: "SMS_SEND_REQUESTED",
} as const;

/**
 * Call inside the SAME transaction that creates the Message + MessageRecipient
 * rows + wallet reservations — this is the write half of the transactional
 * outbox pattern. See modules/messaging/service.ts and
 * docs/architecture.md "Transactional outbox".
 */
export function createSmsSendRequestedEvent(tx: Prisma.TransactionClient, messageId: string) {
  return outboxRepository.create(tx, {
    aggregateType: "MESSAGE",
    aggregateId: messageId,
    eventType: OutboxEventType.SMS_SEND_REQUESTED,
    payload: { messageId },
  });
}

async function publishEvent(event: OutboxEvent): Promise<void> {
  switch (event.eventType) {
    case OutboxEventType.SMS_SEND_REQUESTED: {
      const payload = event.payload as { messageId: string };
      const recipients = await prisma.messageRecipient.findMany({
        where: { messageId: payload.messageId, status: "QUEUED" },
        select: { id: true },
      });
      // jobId = recipientId gives free BullMQ-level dedup: re-adding a job with an
      // id that's already waiting/active/delayed is a no-op, not a duplicate send.
      await Promise.all(
        recipients.map((r) => queues.smsSend.add("send", { recipientId: r.id }, { jobId: r.id })),
      );
      return;
    }
    default:
      throw new Error(`Unknown outbox event type: ${event.eventType}`);
  }
}

/** Best-effort low-latency publish right after commit; failure just leaves the event PENDING for the poller. */
export async function tryPublishImmediately(event: OutboxEvent): Promise<boolean> {
  try {
    await publishEvent(event);
    await outboxRepository.markPublished(event.id);
    return true;
  } catch (error) {
    logger.warn({ err: error, outboxEventId: event.id }, "Immediate outbox publish failed, will retry via poller");
    return false;
  }
}

const MAX_ATTEMPTS = 10;

/** Runs on a schedule (see workers/outbox-poller.ts) — sweeps up anything the immediate-publish path missed. */
export async function pollAndPublishPending(limit = 100): Promise<{ published: number; failed: number }> {
  const pending = await outboxRepository.listPending(limit);
  let published = 0;
  let failed = 0;

  for (const event of pending) {
    try {
      await publishEvent(event);
      await outboxRepository.markPublished(event.id);
      published++;
    } catch (error) {
      const attempts = event.attempts + 1;
      const message = error instanceof Error ? error.message : String(error);
      if (attempts >= MAX_ATTEMPTS) {
        await outboxRepository.markFailed(event.id, attempts, message);
      } else {
        const backoffMs = Math.min(2 ** attempts * 1000, 5 * 60 * 1000); // capped at 5 minutes
        await outboxRepository.scheduleRetry(event.id, attempts, message, new Date(Date.now() + backoffMs));
      }
      failed++;
      logger.error({ err: error, outboxEventId: event.id, attempts }, "Outbox publish attempt failed");
    }
  }

  return { published, failed };
}

export async function listOutboxEventsForAdmin(actor: ActorContext, status?: OutboxStatus, cursor?: string) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.SYSTEM_MANAGE);
  return outboxRepository.listByStatus({ status, take: 25, cursor });
}

/**
 * Admin-triggered retry for an event that flipped to FAILED (hit MAX_ATTEMPTS).
 * Resets it to PENDING and makes a best-effort immediate publish attempt so it
 * doesn't have to wait for the poller's next tick — falling back to the poller
 * (which will pick it up on its own schedule) if that attempt also fails.
 */
export async function retryOutboxEvent(actor: ActorContext, id: string) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.SYSTEM_MANAGE);

  const event = await outboxRepository.findById(id);
  if (!event) throw AppError.notFound();
  if (event.status !== "FAILED") {
    throw AppError.conflict("Only a FAILED outbox event can be manually retried");
  }

  const reset = await outboxRepository.resetForRetry(id);
  await recordAuditEvent({ actor, action: "outbox.event_retried", resourceType: "OutboxEvent", resourceId: id });

  await tryPublishImmediately(reset);
  return reset;
}
