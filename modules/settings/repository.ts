import { prisma } from "@/infrastructure/database/prisma";

export const settingsRepository = {
  findByKey(key: string) {
    return prisma.systemSetting.findUnique({ where: { key } });
  },

  list() {
    return prisma.systemSetting.findMany({ orderBy: { key: "asc" } });
  },

  /** Only ever updates an existing row — settings are seed-created, never created ad hoc from the API. */
  update(key: string, value: string, updatedByUserId: string) {
    return prisma.systemSetting.update({ where: { key }, data: { value, updatedByUserId } });
  },
};
