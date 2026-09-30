import { prisma } from "@/infrastructure/database/prisma";
import type { Prisma, DocumentStatus } from "@/generated/prisma/client";

export const documentRepository = {
  findRequirementByCode(code: string) {
    return prisma.documentRequirement.findUnique({ where: { code } });
  },

  listRequirements(appliesTo?: "ORGANIZATION" | "SENDER_ID") {
    return prisma.documentRequirement.findMany({
      where: { active: true, appliesTo },
      orderBy: { label: "asc" },
    });
  },

  create(data: Prisma.DocumentCreateInput) {
    return prisma.document.create({ data });
  },

  findById(id: string) {
    return prisma.document.findUnique({ where: { id } });
  },

  listForOrganization(organizationId: string, senderIdRequestId?: string) {
    return prisma.document.findMany({
      where: { organizationId, senderIdRequestId },
      orderBy: { createdAt: "desc" },
      include: { documentRequirement: true },
    });
  },

  review(id: string, status: DocumentStatus, reviewedByUserId: string, reviewNotes?: string) {
    return prisma.document.update({
      where: { id },
      data: { status, reviewedByUserId, reviewNotes, reviewedAt: new Date() },
    });
  },

  delete(id: string) {
    return prisma.document.delete({ where: { id } });
  },
};
