import { prisma } from "@/infrastructure/database/prisma";
import type { Prisma, SenderIdRequestStatus } from "@/generated/prisma/client";

export const senderIdRepository = {
  create(data: Prisma.SenderIdRequestCreateInput) {
    return prisma.senderIdRequest.create({ data });
  },

  findById(id: string) {
    return prisma.senderIdRequest.findUnique({
      where: { id },
      include: { statusHistory: { orderBy: { createdAt: "asc" } }, approvedSenderId: true },
    });
  },

  update(id: string, data: Prisma.SenderIdRequestUpdateInput) {
    return prisma.senderIdRequest.update({ where: { id }, data });
  },

  listForOrganization(organizationId: string, status?: SenderIdRequestStatus) {
    return prisma.senderIdRequest.findMany({
      where: { organizationId, status },
      orderBy: { createdAt: "desc" },
    });
  },

  listForAdmin(status?: SenderIdRequestStatus, cursor?: string) {
    return prisma.senderIdRequest.findMany({
      where: { status },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { organization: { select: { id: true, legalName: true } } },
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
  },

  addStatusHistory(data: {
    senderIdRequestId: string;
    fromStatus: SenderIdRequestStatus | null;
    toStatus: SenderIdRequestStatus;
    actorUserId?: string | null;
    note?: string | null;
  }) {
    return prisma.senderIdRequestStatusHistory.create({ data });
  },

  createSenderId(data: Prisma.SenderIdCreateInput) {
    return prisma.senderId.create({ data });
  },

  listSenderIdsForOrganization(organizationId: string) {
    return prisma.senderId.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
  },

  findSenderIdById(id: string) {
    return prisma.senderId.findUnique({ where: { id } });
  },

  updateSenderIdStatus(id: string, status: "ACTIVE" | "SUSPENDED" | "EXPIRED" | "CANCELLED") {
    const extra =
      status === "SUSPENDED"
        ? { suspendedAt: new Date() }
        : status === "ACTIVE"
          ? { activatedAt: new Date(), suspendedAt: null }
          : {};
    return prisma.senderId.update({ where: { id }, data: { status, ...extra } });
  },
};
