import { prisma } from "@/infrastructure/database/prisma";
import { messagingRepository } from "./repository";
import { resolveSmsProvider } from "@/modules/providers/factory";
import { canAttempt, recordSuccess, recordFailure } from "@/modules/providers/circuit-breaker";
import { resolveReservationForRecipient } from "@/modules/wallets/service";
import { logger } from "@/infrastructure/logging/logger";
import type { ProviderCallStatus, Prisma } from "@/generated/prisma/client";

const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * Executed by the sms-send BullMQ worker (workers/sms-send-worker.ts) for a
 * single recipientId. Reloads everything from Postgres — the job payload is
 * just an id (see infrastructure/queues/jobs.ts). Throwing lets BullMQ retry
 * with backoff for transient provider failures; returning normally (even
 * after marking the recipient FAILED) tells BullMQ the job is done.
 */
export async function processSmsSendJob(recipientId: string): Promise<void> {
  const recipient = await messagingRepository.findRecipientById(recipientId);
  if (!recipient) {
    logger.warn({ recipientId }, "sms-send job for unknown recipient — skipping");
    return;
  }

  // Idempotency: a duplicate/racing job for an already-progressed recipient is a no-op.
  if (recipient.status !== "QUEUED") {
    logger.info({ recipientId, status: recipient.status }, "sms-send job skipped — recipient already progressed");
    return;
  }

  await messagingRepository.updateRecipient(recipientId, { status: "PROCESSING", processingAt: new Date() });

  const { provider, config } = await resolveSmsProvider(recipient.message.environment);
  const circuitKey = `sms:${config.providerCode}:${recipient.message.environment}`;
  const maxAttempts = config.retryCount ?? DEFAULT_MAX_ATTEMPTS;

  const senderId = await prisma.senderId.findUniqueOrThrow({ where: { id: recipient.message.senderIdId } });

  if (!(await canAttempt(circuitKey))) {
    await handleTransientFailure(recipient, config, maxAttempts, "PROVIDER_CIRCUIT_OPEN", "Provider circuit breaker is open");
    return;
  }

  let callStatus: ProviderCallStatus;
  let providerMessageId: string | undefined;
  let errorCode: string | undefined;
  let errorMessage: string | undefined;
  let raw: unknown;

  try {
    const result = await provider.sendSms({
      senderId: senderId.value,
      recipient: recipient.phoneNormalized,
      message: recipient.message.content,
      clientReference: recipient.message.clientReference ?? undefined,
      simulatorContext: {
        environment: recipient.message.environment,
        organizationId: recipient.organizationId,
        recipientId: recipient.id,
        apiKeyId: recipient.message.apiKeyId ?? undefined,
        attemptNumber: recipient.attempts + 1,
      },
    });
    callStatus = result.status;
    providerMessageId = result.providerMessageId;
    errorCode = result.errorCode;
    errorMessage = result.errorMessage;
    raw = result.raw;
  } catch (error) {
    callStatus = "ERROR";
    errorMessage = error instanceof Error ? error.message : "Unknown provider error";
    raw = { error: errorMessage };
  }

  await prisma.providerTransaction.create({
    data: {
      recipient: { connect: { id: recipient.id } },
      providerCode: config.providerCode,
      providerMessageId,
      requestPayload: { senderId: senderId.value, recipient: recipient.phoneNormalized },
      responsePayload: raw as Prisma.InputJsonValue,
      status: callStatus,
      attempt: recipient.attempts + 1,
    },
  });

  if (callStatus === "ACCEPTED") {
    await recordSuccess(circuitKey);
    await prisma.$transaction(async (tx) => {
      await tx.messageRecipient.update({
        where: { id: recipient.id },
        data: { status: "SENT", providerMessageId, sentAt: new Date(), attempts: { increment: 1 } },
      });
      await messagingRepository.recomputeAggregateStatus(tx, recipient.messageId);
    });
    await resolveReservationForRecipient(recipient.id, "CONSUMED");
    return;
  }

  if (callStatus === "REJECTED") {
    // Permanent — the provider gave a definitive no, retrying won't help.
    await recordFailure(circuitKey, config.circuitBreakerFailureThreshold ?? 5, config.circuitBreakerCooldownMs ?? 30_000);
    await failRecipientTerminally(recipient.id, errorCode ?? "PROVIDER_REJECTED", errorMessage ?? "Rejected by provider");
    return;
  }

  // TIMEOUT / ERROR — transient, subject to the business-level retry ceiling.
  await recordFailure(circuitKey, config.circuitBreakerFailureThreshold ?? 5, config.circuitBreakerCooldownMs ?? 30_000);
  await handleTransientFailure(recipient, config, maxAttempts, errorCode ?? "PROVIDER_TIMEOUT", errorMessage ?? "Provider call failed");
}

async function handleTransientFailure(
  recipient: NonNullable<Awaited<ReturnType<typeof messagingRepository.findRecipientById>>>,
  config: { providerCode: string },
  maxAttempts: number,
  errorCode: string,
  errorMessage: string,
): Promise<void> {
  const attempts = recipient.attempts + 1;

  if (attempts >= maxAttempts) {
    await messagingRepository.updateRecipient(recipient.id, { attempts });
    await failRecipientTerminally(recipient.id, errorCode, errorMessage);
    return;
  }

  await messagingRepository.updateRecipient(recipient.id, { status: "QUEUED", attempts });
  logger.warn({ recipientId: recipient.id, attempts, maxAttempts, provider: config.providerCode }, errorMessage);
  throw new Error(errorMessage); // lets BullMQ retry this job with backoff
}

async function failRecipientTerminally(recipientId: string, failureCode: string, failureReason: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.messageRecipient.update({
      where: { id: recipientId },
      data: { status: "FAILED", failureCode, failureReason, failedAt: new Date() },
    });
    const recipient = await tx.messageRecipient.findUniqueOrThrow({ where: { id: recipientId } });
    await messagingRepository.recomputeAggregateStatus(tx, recipient.messageId);
  });
  await resolveReservationForRecipient(recipientId, "RELEASED");
}
