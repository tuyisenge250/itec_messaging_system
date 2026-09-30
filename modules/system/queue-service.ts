import { queues } from "@/infrastructure/queues/queues";
import { QueueName } from "@/infrastructure/queues/queue-names";
import { assertPermission, requirePlatformAdmin } from "@/modules/auth/services/authorization-service";
import { recordAuditEvent } from "@/modules/audit/service";
import { AppError } from "@/shared/errors/app-error";
import { PermissionCode } from "@/shared/constants/permissions";
import type { ActorContext } from "@/shared/types/actor-context";
import type { Queue } from "bullmq";

/** All named queues, keyed by their BullMQ queue name (not the object property name) — see infrastructure/queues/queue-names.ts. */
const QUEUES_BY_NAME: Record<string, Queue> = {
  [QueueName.SMS_SEND]: queues.smsSend,
  [QueueName.SMS_DELIVERY]: queues.smsDelivery,
  [QueueName.OUTBOX_PUBLISH]: queues.outboxPublish,
  [QueueName.SCHEDULED_MESSAGES]: queues.scheduledMessages,
  [QueueName.WEBHOOK_DISPATCH]: queues.webhookDispatch,
};

/** Never trust a client-supplied queue name to index into BullMQ directly — resolve only against the known set. */
function resolveQueue(queueName: string): Queue {
  const queue = QUEUES_BY_NAME[queueName];
  if (!queue) throw AppError.notFound("Unknown queue");
  return queue;
}

export interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  isPaused: boolean;
}

export async function getQueueStats(actor: ActorContext): Promise<QueueStats[]> {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.SYSTEM_MANAGE);

  return Promise.all(
    Object.entries(QUEUES_BY_NAME).map(async ([name, queue]): Promise<QueueStats> => {
      const [counts, isPaused] = await Promise.all([
        queue.getJobCounts("waiting", "active", "completed", "failed", "delayed"),
        queue.isPaused(),
      ]);
      return {
        name,
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
        isPaused,
      };
    }),
  );
}

export async function listFailedJobs(actor: ActorContext, queueName: string, limit = 25) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.SYSTEM_MANAGE);

  const queue = resolveQueue(queueName);
  const jobs = await queue.getJobs(["failed"], 0, limit - 1);
  return jobs.map((job) => ({
    id: job.id,
    name: job.name,
    data: job.data,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason,
    timestamp: job.timestamp,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
  }));
}

export async function retryJob(actor: ActorContext, queueName: string, jobId: string) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.SYSTEM_MANAGE);

  const queue = resolveQueue(queueName);
  const job = await queue.getJob(jobId);
  if (!job) throw AppError.notFound("Job not found");

  await job.retry();

  await recordAuditEvent({
    actor,
    action: "queue.job_retried",
    resourceType: "QueueJob",
    resourceId: jobId,
    metadata: { queueName },
  });
}

export async function removeJob(actor: ActorContext, queueName: string, jobId: string) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.SYSTEM_MANAGE);

  const queue = resolveQueue(queueName);
  const job = await queue.getJob(jobId);
  if (!job) throw AppError.notFound("Job not found");

  await job.remove();

  await recordAuditEvent({
    actor,
    action: "queue.job_removed",
    resourceType: "QueueJob",
    resourceId: jobId,
    metadata: { queueName },
  });
}

/** Stops the queue's workers from picking up new jobs — already-active jobs finish, nothing new starts. */
export async function pauseQueue(actor: ActorContext, queueName: string) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.SYSTEM_MANAGE);

  const queue = resolveQueue(queueName);
  await queue.pause();

  await recordAuditEvent({ actor, action: "queue.paused", resourceType: "Queue", resourceId: queueName });
}

export async function resumeQueue(actor: ActorContext, queueName: string) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.SYSTEM_MANAGE);

  const queue = resolveQueue(queueName);
  await queue.resume();

  await recordAuditEvent({ actor, action: "queue.resumed", resourceType: "Queue", resourceId: queueName });
}
