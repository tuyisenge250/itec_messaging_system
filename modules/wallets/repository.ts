import { prisma } from "@/infrastructure/database/prisma";
import type { Prisma, Environment, LedgerEntryType, LedgerReferenceType } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient | typeof prisma;

export const walletRepository = {
  findByOrgEnv(organizationId: string, environment: Environment, tx: Tx = prisma) {
    return tx.wallet.findUnique({ where: { organizationId_environment: { organizationId, environment } } });
  },

  findById(id: string, tx: Tx = prisma) {
    return tx.wallet.findUnique({ where: { id } });
  },

  /**
   * Atomically moves `amountMinorUnits` from available -> reserved, but only
   * if available balance actually covers it. The WHERE clause's balance
   * check and the UPDATE happen as one atomic Postgres statement, so two
   * concurrent reservations against the same wallet can never both succeed
   * past the balance they can't both afford — Postgres serializes the two
   * UPDATEs on the same row, and the second one re-evaluates the (now
   * lower) balance. Returns null when there isn't enough available balance.
   */
  async tryReserve(tx: Tx, walletId: string, amountMinorUnits: number) {
    const result = await tx.wallet.updateMany({
      where: { id: walletId, availableBalanceMinorUnits: { gte: amountMinorUnits } },
      data: {
        availableBalanceMinorUnits: { decrement: amountMinorUnits },
        reservedBalanceMinorUnits: { increment: amountMinorUnits },
      },
    });
    if (result.count === 0) return null;
    return tx.wallet.findUniqueOrThrow({ where: { id: walletId } });
  },

  /** Moves `amountMinorUnits` from reserved back to available (a released reservation). */
  async release(tx: Tx, walletId: string, amountMinorUnits: number) {
    await tx.wallet.updateMany({
      where: { id: walletId, reservedBalanceMinorUnits: { gte: amountMinorUnits } },
      data: {
        reservedBalanceMinorUnits: { decrement: amountMinorUnits },
        availableBalanceMinorUnits: { increment: amountMinorUnits },
      },
    });
    return tx.wallet.findUniqueOrThrow({ where: { id: walletId } });
  },

  /** Removes `amountMinorUnits` from reserved permanently (the reservation was spent). */
  async consumeReserved(tx: Tx, walletId: string, amountMinorUnits: number) {
    await tx.wallet.updateMany({
      where: { id: walletId, reservedBalanceMinorUnits: { gte: amountMinorUnits } },
      data: { reservedBalanceMinorUnits: { decrement: amountMinorUnits } },
    });
    return tx.wallet.findUniqueOrThrow({ where: { id: walletId } });
  },

  async credit(tx: Tx, walletId: string, amountMinorUnits: number) {
    await tx.wallet.update({
      where: { id: walletId },
      data: { availableBalanceMinorUnits: { increment: amountMinorUnits } },
    });
    return tx.wallet.findUniqueOrThrow({ where: { id: walletId } });
  },

  createLedgerEntry(
    tx: Tx,
    data: {
      walletId: string;
      organizationId: string;
      type: LedgerEntryType;
      amountMinorUnits: number;
      balanceAfterMinorUnits: number;
      reservedAfterMinorUnits: number;
      referenceType?: LedgerReferenceType;
      referenceId?: string;
      description?: string;
      createdByUserId?: string;
    },
  ) {
    return tx.walletLedgerEntry.create({ data });
  },

  createReservation(
    tx: Tx,
    data: { walletId: string; organizationId: string; recipientId: string; amountMinorUnits: number; currency: string },
  ) {
    return tx.walletReservation.create({ data });
  },

  findReservationByRecipientId(recipientId: string, tx: Tx = prisma) {
    return tx.walletReservation.findUnique({ where: { recipientId } });
  },

  resolveReservation(tx: Tx, id: string, status: "CONSUMED" | "RELEASED") {
    const timestampField = status === "CONSUMED" ? { consumedAt: new Date() } : { releasedAt: new Date() };
    return tx.walletReservation.update({ where: { id }, data: { status, ...timestampField } });
  },

  listLedgerEntries(walletId: string, params: { take: number; cursor?: string }) {
    return prisma.walletLedgerEntry.findMany({
      where: { walletId },
      orderBy: { createdAt: "desc" },
      take: params.take,
      ...(params.cursor ? { skip: 1, cursor: { id: params.cursor } } : {}),
    });
  },
};
