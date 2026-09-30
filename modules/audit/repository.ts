import { prisma } from "@/infrastructure/database/prisma";
import type { Prisma } from "@/generated/prisma/client";

export interface CreateAuditEventInput {
  organizationId?: string | null;
  actorType: "USER" | "API_KEY" | "SYSTEM";
  actorUserId?: string | null;
  actorApiKeyId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export const auditRepository = {
  create(input: CreateAuditEventInput, tx: Prisma.TransactionClient | typeof prisma = prisma) {
    return tx.auditEvent.create({ data: input });
  },

  list(params: {
    organizationId?: string;
    resourceType?: string;
    resourceId?: string;
    actorUserId?: string;
    take: number;
    cursor?: string;
  }) {
    return prisma.auditEvent.findMany({
      where: {
        organizationId: params.organizationId,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        actorUserId: params.actorUserId,
      },
      orderBy: { createdAt: "desc" },
      take: params.take,
      ...(params.cursor ? { skip: 1, cursor: { id: params.cursor } } : {}),
    });
  },
};
