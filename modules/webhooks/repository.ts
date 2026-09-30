import { prisma } from "@/infrastructure/database/prisma";
import type { Prisma } from "@/generated/prisma/client";

export const webhookRepository = {
  create(data: Prisma.WebhookCreateInput) {
    return prisma.webhook.create({ data });
  },

  listForOrganization(organizationId: string) {
    return prisma.webhook.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
  },

  findById(id: string) {
    return prisma.webhook.findUnique({ where: { id } });
  },

  update(id: string, data: Prisma.WebhookUpdateInput) {
    return prisma.webhook.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.webhook.delete({ where: { id } });
  },

  listDeliveries(webhookId: string) {
    return prisma.webhookDelivery.findMany({
      where: { webhookId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  },
};
