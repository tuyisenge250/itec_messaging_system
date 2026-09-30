import { describe, it, expect, afterAll } from "vitest";
import { Worker } from "bullmq";
import { prisma } from "@/infrastructure/database/prisma";
import { redis, createBullMqConnection } from "@/infrastructure/redis/client";
import { queues } from "@/infrastructure/queues/queues";
import { QueueName } from "@/infrastructure/queues/queue-names";
import { registerUser } from "@/modules/auth/services/auth-service";
import { getQueueStats, listFailedJobs, retryJob, removeJob, pauseQueue, resumeQueue } from "@/modules/system/queue-service";
import type { ActorContext } from "@/shared/types/actor-context";

const runId = Date.now();
const testEmail = (label: string) => `system-queues-test-${label}-${runId}@example.test`;

async function setupPlatformAdmin(label: string) {
  const { user } = await registerUser({ email: testEmail(label), password: "CorrectHorse123", name: label }, {});
  await prisma.user.update({ where: { id: user.id }, data: { isPlatformAdmin: true } });
  const actor: ActorContext = { actorType: "USER", requestId: "test", userId: user.id, isPlatformAdmin: true };
  return { user, actor };
}

/** Enqueues a throwaway job on the webhook-dispatch queue and drives it to FAILED using a one-shot in-process Worker — the standalone `workers/main.ts` process must be stopped for this test run (see CLAUDE.md), so nothing else races to consume it. */
async function createFailedJob(): Promise<string> {
  const job = await queues.webhookDispatch.add("test-failure", { webhookDeliveryId: `test-${runId}` }, { attempts: 1 });
  const worker = new Worker(
    QueueName.WEBHOOK_DISPATCH,
    async () => {
      throw new Error("intentional test failure");
    },
    { connection: createBullMqConnection() },
  );
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("timed out waiting for test job to fail")), 10_000);
    worker.on("failed", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
  await worker.close();
  return job.id!;
}

afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});

describe("admin queue management", () => {
  it("getQueueStats reflects a failed job, and retryJob transitions it out of failed", async () => {
    const { actor: admin } = await setupPlatformAdmin("retry");
    const jobId = await createFailedJob();

    const failedJobs = await listFailedJobs(admin, QueueName.WEBHOOK_DISPATCH);
    expect(failedJobs.some((j) => j.id === jobId)).toBe(true);

    const stats = await getQueueStats(admin);
    const webhookStats = stats.find((s) => s.name === QueueName.WEBHOOK_DISPATCH);
    expect(webhookStats!.failed).toBeGreaterThanOrEqual(1);

    await retryJob(admin, QueueName.WEBHOOK_DISPATCH, jobId);
    const failedAfterRetry = await listFailedJobs(admin, QueueName.WEBHOOK_DISPATCH);
    expect(failedAfterRetry.some((j) => j.id === jobId)).toBe(false);

    // Clean up — the retried job is now waiting with no worker running to pick it up.
    await removeJob(admin, QueueName.WEBHOOK_DISPATCH, jobId);
  }, 20_000);

  it("removeJob deletes a failed job permanently", async () => {
    const { actor: admin } = await setupPlatformAdmin("remove");
    const jobId = await createFailedJob();

    await removeJob(admin, QueueName.WEBHOOK_DISPATCH, jobId);
    const failedJobs = await listFailedJobs(admin, QueueName.WEBHOOK_DISPATCH);
    expect(failedJobs.some((j) => j.id === jobId)).toBe(false);
  }, 20_000);

  it("rejects an unknown queue name", async () => {
    const { actor: admin } = await setupPlatformAdmin("unknown-queue");
    await expect(listFailedJobs(admin, "not-a-real-queue")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("a non-platform-admin actor is forbidden", async () => {
    const { user } = await registerUser({ email: testEmail("plain"), password: "CorrectHorse123", name: "plain" }, {});
    const plainActor: ActorContext = { actorType: "USER", requestId: "test", userId: user.id };
    await expect(getQueueStats(plainActor)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("pauseQueue and resumeQueue toggle isPaused, reflected in getQueueStats", async () => {
    const { actor: admin } = await setupPlatformAdmin("pause-resume");

    try {
      await pauseQueue(admin, QueueName.SCHEDULED_MESSAGES);
      const statsWhilePaused = await getQueueStats(admin);
      expect(statsWhilePaused.find((s) => s.name === QueueName.SCHEDULED_MESSAGES)!.isPaused).toBe(true);

      await resumeQueue(admin, QueueName.SCHEDULED_MESSAGES);
      const statsAfterResume = await getQueueStats(admin);
      expect(statsAfterResume.find((s) => s.name === QueueName.SCHEDULED_MESSAGES)!.isPaused).toBe(false);
    } finally {
      // Always leave it resumed, even if an assertion above throws — this is a real
      // queue the live worker process depends on once restarted after this test run.
      await queues.scheduledMessages.resume();
    }
  });

  it("pause/resume reject a non-platform-admin actor and an unknown queue name", async () => {
    const { user } = await registerUser({ email: testEmail("plain-pause"), password: "CorrectHorse123", name: "plain" }, {});
    const plainActor: ActorContext = { actorType: "USER", requestId: "test", userId: user.id };
    await expect(pauseQueue(plainActor, QueueName.SCHEDULED_MESSAGES)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const { actor: admin } = await setupPlatformAdmin("pause-unknown");
    await expect(pauseQueue(admin, "not-a-real-queue")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
