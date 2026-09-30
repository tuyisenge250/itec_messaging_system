import { prisma } from "@/infrastructure/database/prisma";
import type { Prisma, CampaignStatus } from "@/generated/prisma/client";

export const campaignRepository = {
  create(data: Prisma.CampaignCreateInput) {
    return prisma.campaign.create({ data });
  },

  findById(id: string) {
    return prisma.campaign.findUnique({ where: { id }, include: { batches: { include: { message: true } } } });
  },

  update(id: string, data: Prisma.CampaignUpdateInput) {
    return prisma.campaign.update({ where: { id }, data });
  },

  list(organizationId: string, status?: CampaignStatus) {
    return prisma.campaign.findMany({ where: { organizationId, status }, orderBy: { createdAt: "desc" } });
  },

  createBatch(data: { campaignId: string; batchNumber: number; messageId: string }) {
    return prisma.campaignBatch.create({ data });
  },

  /**
   * `CampaignBatch` has `@@unique([campaignId, batchNumber])`, so a recurring
   * campaign's second occurrence must continue the batch-number sequence
   * rather than restart at 1 — this count is where the next occurrence's
   * numbering picks up from.
   */
  countBatches(campaignId: string) {
    return prisma.campaignBatch.count({ where: { campaignId } });
  },

  listDue(limit: number) {
    return prisma.campaign.findMany({
      where: { status: "SCHEDULED", nextRunAt: { lte: new Date() } },
      take: limit,
    });
  },
};
