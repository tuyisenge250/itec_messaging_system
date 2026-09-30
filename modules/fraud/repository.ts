import { prisma } from "@/infrastructure/database/prisma";
import type { Prisma, FraudRuleType, FraudEventStatus } from "@/generated/prisma/client";

export const fraudRepository = {
  listEnabledRulesByType(ruleType: FraudRuleType, organizationId: string) {
    return prisma.fraudRule.findMany({
      where: {
        ruleType,
        enabled: true,
        OR: [{ scope: "GLOBAL" }, { scope: "ORGANIZATION", organizationId }],
      },
    });
  },

  listAll() {
    return prisma.fraudRule.findMany({ orderBy: [{ scope: "asc" }, { ruleType: "asc" }] });
  },

  createRule(data: Prisma.FraudRuleCreateInput) {
    return prisma.fraudRule.create({ data });
  },

  createEvent(data: Prisma.FraudEventCreateInput) {
    return prisma.fraudEvent.create({ data });
  },

  listEvents(params: { status?: FraudEventStatus; organizationId?: string; take: number; cursor?: string }) {
    return prisma.fraudEvent.findMany({
      where: { status: params.status, organizationId: params.organizationId },
      orderBy: { createdAt: "desc" },
      take: params.take,
      ...(params.cursor ? { skip: 1, cursor: { id: params.cursor } } : {}),
    });
  },

  findEventById(id: string) {
    return prisma.fraudEvent.findUnique({ where: { id } });
  },

  reviewEvent(id: string, status: "RESOLVED" | "DISMISSED", reviewedByUserId: string, reviewNotes?: string) {
    return prisma.fraudEvent.update({
      where: { id },
      data: { status, reviewedByUserId, reviewNotes, reviewedAt: new Date() },
    });
  },
};
