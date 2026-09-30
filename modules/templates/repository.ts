import { prisma } from "@/infrastructure/database/prisma";
import type { Prisma } from "@/generated/prisma/client";

export const templateRepository = {
  create(data: Prisma.TemplateCreateInput) {
    return prisma.template.create({ data });
  },

  findById(id: string) {
    return prisma.template.findUnique({ where: { id } });
  },

  update(id: string, data: Prisma.TemplateUpdateInput) {
    return prisma.template.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.template.delete({ where: { id } });
  },

  list(organizationId: string) {
    return prisma.template.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
  },
};
