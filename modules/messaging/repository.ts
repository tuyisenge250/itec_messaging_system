import { prisma } from "@/infrastructure/database/prisma";
import type { Prisma, MessageStatus, RecipientStatus } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient | typeof prisma;

export const messagingRepository = {
  createMessage(tx: Tx, data: Prisma.MessageCreateInput) {
    return tx.message.create({ data });
  },

  createRecipient(tx: Tx, data: Prisma.MessageRecipientCreateInput) {
    return tx.messageRecipient.create({ data });
  },

  updateMessageCounts(
    tx: Tx,
    id: string,
    data: Partial<{
      status: MessageStatus;
      totalRecipients: number;
      queuedCount: number;
      totalCostMinorUnits: number;
    }>,
  ) {
    return tx.message.update({ where: { id }, data });
  },

  findById(id: string) {
    return prisma.message.findUnique({ where: { id } });
  },

  findByIdWithRecipients(id: string) {
    return prisma.message.findUnique({ where: { id }, include: { recipients: true, senderId: true } });
  },

  listForOrganization(organizationId: string, params: { status?: MessageStatus; take: number; cursor?: string }) {
    return prisma.message.findMany({
      where: { organizationId, status: params.status },
      orderBy: { createdAt: "desc" },
      take: params.take,
      ...(params.cursor ? { skip: 1, cursor: { id: params.cursor } } : {}),
    });
  },

  listForAdmin(params: { status?: MessageStatus; take: number; cursor?: string }) {
    return prisma.message.findMany({
      where: { status: params.status },
      orderBy: { createdAt: "desc" },
      take: params.take,
      include: { organization: { select: { id: true, legalName: true } } },
      ...(params.cursor ? { skip: 1, cursor: { id: params.cursor } } : {}),
    });
  },

  listRecipients(messageId: string, params: { status?: RecipientStatus; take: number; cursor?: string }) {
    return prisma.messageRecipient.findMany({
      where: { messageId, status: params.status },
      orderBy: { createdAt: "asc" },
      take: params.take,
      ...(params.cursor ? { skip: 1, cursor: { id: params.cursor } } : {}),
    });
  },

  findRecipientById(id: string) {
    return prisma.messageRecipient.findUnique({ where: { id }, include: { message: true } });
  },

  listProviderTransactions(recipientId: string) {
    return prisma.providerTransaction.findMany({ where: { recipientId }, orderBy: { createdAt: "asc" } });
  },

  updateRecipient(id: string, data: Prisma.MessageRecipientUpdateInput) {
    return prisma.messageRecipient.update({ where: { id }, data });
  },

  /**
   * Atomically bumps one recipient-status counter down and another up on the
   * parent Message, and flips the aggregate `status` once every recipient
   * has reached a terminal state — all inside one UPDATE so concurrent
   * recipient-status transitions (many workers finishing around the same
   * time) can't race each other into an inconsistent aggregate.
   */
  async recomputeAggregateStatus(tx: Tx, messageId: string) {
    const [message, counts] = await Promise.all([
      tx.message.findUniqueOrThrow({ where: { id: messageId } }),
      tx.messageRecipient.groupBy({ by: ["status"], where: { messageId }, _count: true }),
    ]);

    const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count])) as Record<string, number>;
    const queuedCount = byStatus.QUEUED ?? 0;
    const processingCount = byStatus.PROCESSING ?? 0;
    const sentCount = byStatus.SENT ?? 0;
    const deliveredCount = byStatus.DELIVERED ?? 0;
    // No dedicated aggregate bucket for REJECTED/CANCELLED/EXPIRED in this schema —
    // they're folded into failedCount as "did not result in delivery".
    const failedCount = (byStatus.FAILED ?? 0) + (byStatus.REJECTED ?? 0) + (byStatus.EXPIRED ?? 0) + (byStatus.CANCELLED ?? 0);

    const terminal = queuedCount === 0 && processingCount === 0;
    let status: MessageStatus = message.status;
    if (terminal) {
      if (deliveredCount > 0 && failedCount > 0) status = "PARTIALLY_DELIVERED";
      else if (deliveredCount > 0) status = "DELIVERED";
      else if (sentCount > 0) status = "SENT";
      else if (failedCount === message.totalRecipients) status = "FAILED";
      else status = "SENT";
    } else if (processingCount > 0 || sentCount > 0) {
      status = "PROCESSING";
    }

    return tx.message.update({
      where: { id: messageId },
      data: { queuedCount, processingCount, sentCount, deliveredCount, failedCount, status },
    });
  },
};
