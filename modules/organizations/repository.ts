import { prisma } from "@/infrastructure/database/prisma";
import type { Prisma, OrganizationStatus, Environment } from "@/generated/prisma/client";

export const organizationRepository = {
  create(data: Prisma.OrganizationCreateInput, tx: Prisma.TransactionClient | typeof prisma = prisma) {
    return tx.organization.create({ data });
  },

  findById(id: string) {
    return prisma.organization.findUnique({ where: { id } });
  },

  findByIdWithDetails(id: string) {
    return prisma.organization.findUnique({
      where: { id },
      include: {
        wallets: true,
        pricingPlan: true,
        _count: { select: { memberships: true, senderIds: true, apiKeys: true, documents: true } },
      },
    });
  },

  update(id: string, data: Prisma.OrganizationUpdateInput) {
    return prisma.organization.update({ where: { id }, data });
  },

  updateStatus(id: string, status: OrganizationStatus) {
    return prisma.organization.update({ where: { id }, data: { status } });
  },

  list(params: { status?: OrganizationStatus; take: number; cursor?: string }) {
    return prisma.organization.findMany({
      where: { status: params.status },
      orderBy: { createdAt: "desc" },
      take: params.take,
      ...(params.cursor ? { skip: 1, cursor: { id: params.cursor } } : {}),
    });
  },

  createMembership(
    data: { organizationId: string; userId: string; roleId: string; status?: "ACTIVE" | "INVITED" },
    tx: Prisma.TransactionClient | typeof prisma = prisma,
  ) {
    return tx.organizationMembership.create({
      data: {
        organizationId: data.organizationId,
        userId: data.userId,
        roleId: data.roleId,
        status: data.status ?? "ACTIVE",
        joinedAt: (data.status ?? "ACTIVE") === "ACTIVE" ? new Date() : null,
      },
    });
  },

  listMembers(organizationId: string) {
    return prisma.organizationMembership.findMany({
      where: { organizationId },
      include: { user: true, role: true },
      orderBy: { createdAt: "asc" },
    });
  },

  findMembershipById(id: string) {
    return prisma.organizationMembership.findUnique({ where: { id } });
  },

  findMembershipByOrgAndUser(organizationId: string, userId: string) {
    return prisma.organizationMembership.findUnique({ where: { organizationId_userId: { organizationId, userId } } });
  },

  reactivateMembership(id: string, roleId: string) {
    return prisma.organizationMembership.update({ where: { id }, data: { roleId, status: "ACTIVE", joinedAt: new Date() } });
  },

  updateMembershipRole(id: string, roleId: string) {
    return prisma.organizationMembership.update({ where: { id }, data: { roleId } });
  },

  removeMembership(id: string) {
    return prisma.organizationMembership.update({ where: { id }, data: { status: "REMOVED" } });
  },

  countActiveAdmins(organizationId: string, roleId: string) {
    return prisma.organizationMembership.count({
      where: { organizationId, roleId, status: "ACTIVE" },
    });
  },

  countOtherOrganizationMemberships(userId: string, excludeOrganizationId: string) {
    return prisma.organizationMembership.count({
      where: { userId, organizationId: { not: excludeOrganizationId }, status: { not: "REMOVED" } },
    });
  },

  ensureWallet(organizationId: string, environment: Environment, tx: Prisma.TransactionClient | typeof prisma = prisma) {
    return tx.wallet.upsert({
      where: { organizationId_environment: { organizationId, environment } },
      create: { organizationId, environment },
      update: {},
    });
  },
};
