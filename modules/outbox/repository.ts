import { prisma } from "@/infrastructure/database/prisma";
import type { Prisma } from "@/generated/prisma/client";

export const outboxRepository = {
  create(
    tx: Prisma.TransactionClient,
    data: { aggregateType: string; aggregateId: string; eventType: string; payload: Prisma.InputJsonValue },
  ) {
    return tx.outboxEvent.create({ data });
  },

  markPublished(id: string) {
    return prisma.outboxEvent.update({ where: { id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  },

  markFailed(id: string, attempts: number, lastError: string) {
    return prisma.outboxEvent.update({ where: { id }, data: { status: "FAILED", attempts, lastError } });
  },

  /** Records a failed attempt and pushes nextAttemptAt forward with exponential backoff. */
  scheduleRetry(id: string, attempts: number, lastError: string, nextAttemptAt: Date) {
    return prisma.outboxEvent.update({ where: { id }, data: { attempts, lastError, nextAttemptAt } });
  },

  listPending(limit: number) {
    return prisma.outboxEvent.findMany({
      where: { status: "PENDING", nextAttemptAt: { lte: new Date() } },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
  },

  listByStatus(params: { status?: "PENDING" | "PUBLISHED" | "FAILED"; take: number; cursor?: string }) {
    return prisma.outboxEvent.findMany({
      where: { status: params.status },
      orderBy: { createdAt: "desc" },
      take: params.take,
      ...(params.cursor ? { skip: 1, cursor: { id: params.cursor } } : {}),
    });
  },

  findById(id: string) {
    return prisma.outboxEvent.findUnique({ where: { id } });
  },

  /** Manual-retry reset — deliberately leaves `attempts` untouched so a genuinely
   * broken event still exhausts pollAndPublishPending's MAX_ATTEMPTS over repeated
   * manual retries instead of being retriable forever. */
  resetForRetry(id: string) {
    return prisma.outboxEvent.update({ where: { id }, data: { status: "PENDING", nextAttemptAt: new Date() } });
  },
};
