import { prisma } from "@/infrastructure/database/prisma";
import { messagingRepository } from "./repository";
import { senderIdRepository } from "@/modules/sender-ids/repository";
import { reserveForRecipient, resolveReservationForRecipient } from "@/modules/wallets/service";
import { walletRepository } from "@/modules/wallets/repository";
import { calculateMessageCost } from "@/modules/billing/pricing-service";
import { checkSmsSendLimits } from "@/modules/fraud/service";
import { createSmsSendRequestedEvent, tryPublishImmediately } from "@/modules/outbox/service";
import { assertPermission, assertOrganizationAccess, assertResourceBelongsToOrganization, requirePlatformAdmin } from "@/modules/auth/services/authorization-service";
import { recordAuditEvent } from "@/modules/audit/service";
import { normalizeRwandaPhoneNumber } from "@/shared/utils/phone";
import { segmentMessage } from "@/shared/utils/sms-segmentation";
import { AppError } from "@/shared/errors/app-error";
import { ErrorCode } from "@/shared/errors/error-codes";
import { PermissionCode } from "@/shared/constants/permissions";
import type { ActorContext } from "@/shared/types/actor-context";
import type { z } from "zod";
import type { sendMessageSchema } from "./validation";
import type { Environment, MessageStatus } from "@/generated/prisma/client";

export interface SendMessageResult {
  message: Awaited<ReturnType<typeof messagingRepository.findById>>;
  acceptedRecipients: number;
  rejectedRecipients: number;
}

export async function sendMessage(
  actor: ActorContext,
  organizationId: string,
  environment: Environment,
  input: z.infer<typeof sendMessageSchema>,
  idempotencyKey?: string,
): Promise<SendMessageResult> {
  await assertPermission(actor, PermissionCode.SMS_SEND);
  assertOrganizationAccess(actor, organizationId);

  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!organization) throw AppError.notFound();
  if (environment === "PRODUCTION" && organization.status !== "ACTIVE") {
    throw AppError.of(ErrorCode.ORGANIZATION_NOT_VERIFIED, "Organization must be verified and active to send production SMS", 403);
  }

  // Exactly one of these is set — enforced by sendMessageSchema's refine.
  // senderId (the sender ID's own value, e.g. "MYBRAND") is looked up already
  // scoped to this organization/environment via its unique constraint;
  // senderIdId still needs the explicit org/environment checks below since an
  // id on its own doesn't guarantee either.
  const senderId = input.senderIdId
    ? await senderIdRepository.findSenderIdById(input.senderIdId)
    : await senderIdRepository.findSenderIdByValue(organizationId, input.senderId!, environment);
  if (!senderId) throw AppError.notFound("Sender ID not found");
  assertResourceBelongsToOrganization(senderId.organizationId, organizationId);
  if (senderId.environment !== environment) {
    throw AppError.validation("Sender ID environment does not match the requested send environment");
  }
  if (senderId.status !== "ACTIVE") {
    throw AppError.of(ErrorCode.SENDER_ID_NOT_ACTIVE, "This sender ID is not active", 409);
  }

  const wallet = await walletRepository.findByOrgEnv(organizationId, environment);
  if (!wallet) throw AppError.notFound("Wallet not found for this environment");

  await checkSmsSendLimits({
    organizationId,
    apiKeyId: actor.apiKeyId,
    ipAddress: actor.ipAddress,
    recipientCount: input.recipients.length,
  });

  const segmentation = segmentMessage(input.content);
  const cost = await calculateMessageCost(organizationId, segmentation.segmentCount);

  const normalizedRecipients = input.recipients.map((raw) => ({ raw, ...normalizeRwandaPhoneNumber(raw, environment) }));
  const validCount = normalizedRecipients.filter((r) => r.valid).length;

  const type = input.recipients.length > 1 ? "BULK" : "TRANSACTIONAL";
  const isScheduled = Boolean(input.scheduledAt) && new Date(input.scheduledAt!).getTime() > Date.now();
  const initialStatus: MessageStatus = isScheduled ? "SCHEDULED" : "QUEUED";

  const result = await prisma.$transaction(async (tx) => {
    const message = await messagingRepository.createMessage(tx, {
      organization: { connect: { id: organizationId } },
      senderId: { connect: { id: senderId.id } },
      apiKey: actor.apiKeyId ? { connect: { id: actor.apiKeyId } } : undefined,
      createdBy: actor.userId ? { connect: { id: actor.userId } } : undefined,
      type,
      environment,
      status: initialStatus,
      content: input.content,
      clientReference: input.clientReference,
      idempotencyKey: idempotencyKey ?? null,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
      totalRecipients: input.recipients.length,
      currency: cost.currency,
    });

    for (const recipient of normalizedRecipients) {
      if (!recipient.valid) {
        await messagingRepository.createRecipient(tx, {
          message: { connect: { id: message.id } },
          organization: { connect: { id: organizationId } },
          phoneRaw: recipient.raw,
          phoneNormalized: recipient.raw,
          status: "REJECTED",
          encoding: segmentation.encoding,
          segmentCount: 0,
          costMinorUnits: 0,
          currency: cost.currency,
          failureCode: "INVALID_RECIPIENT",
          failureReason: recipient.reason,
          failedAt: new Date(),
        });
        continue;
      }

      const messageRecipient = await messagingRepository.createRecipient(tx, {
        message: { connect: { id: message.id } },
        organization: { connect: { id: organizationId } },
        phoneRaw: recipient.raw,
        phoneNormalized: recipient.e164!,
        status: "QUEUED",
        encoding: segmentation.encoding,
        segmentCount: segmentation.segmentCount,
        costMinorUnits: cost.totalCostMinorUnits,
        currency: cost.currency,
        queuedAt: new Date(),
      });

      // Reserving inside this same transaction means an unaffordable batch rolls the
      // whole send back atomically — either every valid recipient gets reserved credit
      // or none do (see docs/architecture.md "Wallet reservation atomicity").
      await reserveForRecipient(tx, {
        organizationId,
        walletId: wallet.id,
        recipientId: messageRecipient.id,
        amountMinorUnits: cost.totalCostMinorUnits,
        currency: cost.currency,
      });
    }

    await messagingRepository.updateMessageCounts(tx, message.id, {
      queuedCount: validCount,
      totalCostMinorUnits: cost.totalCostMinorUnits * validCount,
    });

    if (!isScheduled && validCount > 0) {
      const outboxEvent = await createSmsSendRequestedEvent(tx, message.id);
      return { message, outboxEvent };
    }

    return { message, outboxEvent: null };
  });

  if (result.outboxEvent) {
    await tryPublishImmediately(result.outboxEvent);
  }

  await recordAuditEvent({
    actor,
    action: "message.send",
    resourceType: "Message",
    resourceId: result.message.id,
    organizationId,
    metadata: { totalRecipients: input.recipients.length, validCount, senderIdId: input.senderIdId },
  });

  const finalMessage = await messagingRepository.findById(result.message.id);
  return { message: finalMessage, acceptedRecipients: validCount, rejectedRecipients: input.recipients.length - validCount };
}

export async function getMessage(actor: ActorContext, id: string) {
  const message = await messagingRepository.findById(id);
  if (!message) throw AppError.notFound();
  await assertPermission(actor, PermissionCode.SMS_READ);
  assertOrganizationAccess(actor, message.organizationId);
  return message;
}

export async function listMessages(actor: ActorContext, organizationId: string, status?: MessageStatus, cursor?: string) {
  await assertPermission(actor, PermissionCode.SMS_READ);
  assertOrganizationAccess(actor, organizationId);
  return messagingRepository.listForOrganization(organizationId, { status, take: 25, cursor });
}

export async function listMessagesForAdmin(actor: ActorContext, status?: MessageStatus, cursor?: string) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.SMS_READ);
  return messagingRepository.listForAdmin({ status, take: 25, cursor });
}

export async function listRecipients(actor: ActorContext, messageId: string, cursor?: string) {
  const message = await messagingRepository.findById(messageId);
  if (!message) throw AppError.notFound();
  await assertPermission(actor, PermissionCode.SMS_READ);
  assertOrganizationAccess(actor, message.organizationId);
  return messagingRepository.listRecipients(messageId, { take: 100, cursor });
}

export async function getRecipient(actor: ActorContext, recipientId: string) {
  const recipient = await messagingRepository.findRecipientById(recipientId);
  if (!recipient) throw AppError.notFound();
  await assertPermission(actor, PermissionCode.SMS_READ);
  assertOrganizationAccess(actor, recipient.organizationId);
  return recipient;
}

/** Per-attempt provider call log for one recipient — request/response payloads never contain secrets (see ProviderTransaction usage in send-processor.ts). */
export async function getRecipientProviderTransactions(actor: ActorContext, recipientId: string) {
  const recipient = await messagingRepository.findRecipientById(recipientId);
  if (!recipient) throw AppError.notFound();
  await assertPermission(actor, PermissionCode.SMS_READ);
  assertOrganizationAccess(actor, recipient.organizationId);
  return messagingRepository.listProviderTransactions(recipientId);
}

export async function cancelMessage(actor: ActorContext, id: string) {
  await assertPermission(actor, PermissionCode.SMS_CANCEL);
  const message = await messagingRepository.findById(id);
  if (!message) throw AppError.notFound();
  assertOrganizationAccess(actor, message.organizationId);

  if (!["SCHEDULED", "QUEUED"].includes(message.status)) {
    throw AppError.of(ErrorCode.MESSAGE_NOT_CANCELLABLE, "This message can no longer be cancelled", 409);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const recipients = await tx.messageRecipient.findMany({ where: { messageId: id, status: "QUEUED" } });
    for (const recipient of recipients) {
      await tx.messageRecipient.update({ where: { id: recipient.id }, data: { status: "CANCELLED" } });
    }
    return messagingRepository.recomputeAggregateStatus(tx, id);
  });

  // Release reservations outside the cancellation transaction — one recipient at a time,
  // each already its own atomic unit (see modules/wallets/service.ts).
  const cancelledRecipients = await prisma.messageRecipient.findMany({ where: { messageId: id, status: "CANCELLED" } });
  for (const recipient of cancelledRecipients) {
    await resolveReservationForRecipient(recipient.id, "RELEASED");
  }

  await recordAuditEvent({ actor, action: "message.cancel", resourceType: "Message", resourceId: id, organizationId: message.organizationId });
  return updated;
}

/**
 * Runs on a schedule (see workers/scheduled-messages-worker.ts). A SCHEDULED
 * message already has its recipients created and credits reserved (from
 * sendMessage above) — all this does is flip it to QUEUED and create the
 * outbox event once its scheduledAt has arrived, handing off to the exact
 * same outbox -> sms-send pipeline as an immediate send.
 */
export async function processDueScheduledMessages(limit = 50): Promise<{ processed: number }> {
  const due = await prisma.message.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
    take: limit,
  });

  let processed = 0;
  for (const message of due) {
    const outboxEvent = await prisma.$transaction(async (tx) => {
      await messagingRepository.updateMessageCounts(tx, message.id, { status: "QUEUED" });
      return createSmsSendRequestedEvent(tx, message.id);
    });
    await tryPublishImmediately(outboxEvent);
    processed++;
  }
  return { processed };
}

/**
 * Read-only preview for the "send SMS" form — segmentation/encoding/cost
 * come from the exact same functions the real send path uses
 * (shared/utils/sms-segmentation.ts, modules/billing/pricing-service.ts), so
 * the number shown before sending always matches what actually gets
 * reserved. No wallet reservation, no rows written.
 */
export async function estimateMessageCost(
  actor: ActorContext,
  organizationId: string,
  environment: Environment,
  content: string,
  recipientCount: number,
) {
  await assertPermission(actor, PermissionCode.SMS_READ);
  assertOrganizationAccess(actor, organizationId);

  const segmentation = segmentMessage(content);
  const cost = await calculateMessageCost(organizationId, segmentation.segmentCount);
  const wallet = await walletRepository.findByOrgEnv(organizationId, environment);

  return {
    characterCount: content.length,
    encoding: segmentation.encoding,
    segmentCount: segmentation.segmentCount,
    costPerRecipientMinorUnits: cost.totalCostMinorUnits,
    totalEstimatedCostMinorUnits: cost.totalCostMinorUnits * Math.max(recipientCount, 1),
    currency: cost.currency,
    availableBalanceMinorUnits: wallet?.availableBalanceMinorUnits ?? null,
  };
}
