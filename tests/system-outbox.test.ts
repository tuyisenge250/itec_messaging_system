import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/infrastructure/database/prisma";
import { redis } from "@/infrastructure/redis/client";
import { registerUser } from "@/modules/auth/services/auth-service";
import { listOutboxEventsForAdmin, retryOutboxEvent } from "@/modules/outbox/service";
import type { ActorContext } from "@/shared/types/actor-context";

const runId = Date.now();
const testEmail = (label: string) => `system-outbox-test-${label}-${runId}@example.test`;

async function setupPlatformAdmin(label: string) {
  const { user } = await registerUser({ email: testEmail(label), password: "CorrectHorse123", name: label }, {});
  await prisma.user.update({ where: { id: user.id }, data: { isPlatformAdmin: true } });
  const actor: ActorContext = { actorType: "USER", requestId: "test", userId: user.id, isPlatformAdmin: true };
  return { user, actor };
}

afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});

describe("admin outbox management", () => {
  it("retrying a FAILED event resets it to PENDING", async () => {
    const { actor: admin } = await setupPlatformAdmin("retry-failed");
    const event = await prisma.outboxEvent.create({
      data: {
        aggregateType: "TEST",
        aggregateId: `test-${runId}`,
        eventType: "UNKNOWN_TEST_EVENT", // publishEvent doesn't know this type — tryPublishImmediately swallows the failure, the reset itself is what we're testing
        payload: {},
        status: "FAILED",
        attempts: 3,
        lastError: "simulated failure",
      },
    });

    const result = await retryOutboxEvent(admin, event.id);
    expect(result.status).toBe("PENDING");

    const reloaded = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(reloaded.status).toBe("PENDING");
  });

  it("refuses to retry an event that isn't currently FAILED", async () => {
    const { actor: admin } = await setupPlatformAdmin("retry-pending");
    const event = await prisma.outboxEvent.create({
      data: { aggregateType: "TEST", aggregateId: `test-${runId}-2`, eventType: "UNKNOWN_TEST_EVENT", payload: {}, status: "PENDING" },
    });

    await expect(retryOutboxEvent(admin, event.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("lists events filtered by status", async () => {
    const { actor: admin } = await setupPlatformAdmin("list-status");
    const event = await prisma.outboxEvent.create({
      data: { aggregateType: "TEST", aggregateId: `test-${runId}-3`, eventType: "UNKNOWN_TEST_EVENT", payload: {}, status: "FAILED", lastError: "x" },
    });

    const failedEvents = await listOutboxEventsForAdmin(admin, "FAILED");
    expect(failedEvents.some((e) => e.id === event.id)).toBe(true);

    const publishedEvents = await listOutboxEventsForAdmin(admin, "PUBLISHED");
    expect(publishedEvents.some((e) => e.id === event.id)).toBe(false);
  });

  it("a non-platform-admin actor is forbidden", async () => {
    const { user } = await registerUser({ email: testEmail("plain"), password: "CorrectHorse123", name: "plain" }, {});
    const plainActor: ActorContext = { actorType: "USER", requestId: "test", userId: user.id };
    await expect(listOutboxEventsForAdmin(plainActor)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
