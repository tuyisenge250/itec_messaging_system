import { prisma } from "@/infrastructure/database/prisma";
import type { Prisma, ProviderKind, Environment } from "@/generated/prisma/client";

export const providerConfigRepository = {
  findActive(providerType: ProviderKind, environment: Environment) {
    return prisma.providerConfig.findFirst({
      where: { providerType, environment, isActive: true },
      orderBy: { priority: "desc" },
    });
  },

  list(providerType?: ProviderKind) {
    // Deliberately does not select/join ProviderCredential — credential values must
    // never reach an API response, even to a platform admin, without a dedicated,
    // audited reveal flow that doesn't exist yet.
    return prisma.providerConfig.findMany({ where: { providerType }, orderBy: [{ providerType: "asc" }, { priority: "desc" }] });
  },

  findById(id: string) {
    return prisma.providerConfig.findUnique({ where: { id } });
  },

  findByUniqueKey(providerCode: string, environment: Environment, providerType: ProviderKind) {
    return prisma.providerConfig.findUnique({
      where: { providerCode_environment_providerType: { providerCode, environment, providerType } },
    });
  },

  create(data: Prisma.ProviderConfigCreateInput) {
    return prisma.providerConfig.create({ data });
  },

  update(id: string, data: Prisma.ProviderConfigUpdateInput) {
    return prisma.providerConfig.update({ where: { id }, data });
  },
};
