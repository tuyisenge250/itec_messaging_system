import { prisma } from "@/infrastructure/database/prisma";
import type { Prisma, NotificationType } from "@/generated/prisma/client";

export const notificationsRepository = {
  create(data: { userId: string; organizationId?: string | null; type: NotificationType; title: string; message: string; data?: Prisma.InputJsonValue }) {
    return prisma.notification.create({ data });
  },

  createMany(rows: Array<{ userId: string; organizationId?: string | null; type: NotificationType; title: string; message: string; data?: Prisma.InputJsonValue }>) {
    return prisma.notification.createMany({ data: rows });
  },

  listForUser(userId: string, params: { unreadOnly?: boolean; take: number; cursor?: string }) {
    return prisma.notification.findMany({
      where: { userId, readAt: params.unreadOnly ? null : undefined },
      orderBy: { createdAt: "desc" },
      take: params.take,
      ...(params.cursor ? { skip: 1, cursor: { id: params.cursor } } : {}),
    });
  },

  countUnread(userId: string) {
    return prisma.notification.count({ where: { userId, readAt: null } });
  },

  findById(id: string) {
    return prisma.notification.findUnique({ where: { id } });
  },

  markRead(id: string) {
    return prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  },

  listPlatformAdminUserIds() {
    return prisma.user.findMany({ where: { isPlatformAdmin: true, status: "ACTIVE" }, select: { id: true } });
  },
};
