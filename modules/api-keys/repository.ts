import { prisma } from "@/infrastructure/database/prisma";
import type { Environment, Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient | typeof prisma;

export const apiKeyRepository = {
  create(
    data: {
      organizationId: string;
      environment: Environment;
      name: string;
      publicId: string;
      hashedSecret: string;
      displayPrefix: string;
      scopes: string[];
      createdByUserId: string;
      rotatedFromId?: string | null;
    },
    tx: Tx = prisma,
  ) {
    return tx.apiKey.create({ data });
  },

  findByPublicId(publicId: string) {
    return prisma.apiKey.findUnique({ where: { publicId } });
  },

  findById(id: string) {
    return prisma.apiKey.findUnique({ where: { id } });
  },

  listForOrganization(organizationId: string) {
    return prisma.apiKey.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
  },

  touchLastUsed(id: string) {
    return prisma.apiKey.update({ where: { id }, data: { lastUsedAt: new Date() } });
  },

  revoke(id: string) {
    return prisma.apiKey.update({
      where: { id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
  },
};
