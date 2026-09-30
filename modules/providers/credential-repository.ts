import { prisma } from "@/infrastructure/database/prisma";
import type { ProviderCredentialStatus } from "@/generated/prisma/client";

// Never selects encryptedValue — the API/admin UI has no "reveal" flow, only write/rotate/revoke.
const METADATA_SELECT = {
  id: true,
  providerConfigId: true,
  key: true,
  status: true,
  expiresAt: true,
  rotatedAt: true,
  createdAt: true,
} as const;

export const credentialRepository = {
  listForConfig(providerConfigId: string) {
    return prisma.providerCredential.findMany({
      where: { providerConfigId },
      select: METADATA_SELECT,
      orderBy: { createdAt: "desc" },
    });
  },

  findById(id: string) {
    return prisma.providerCredential.findUnique({ where: { id } });
  },

  create(data: { providerConfigId: string; key: string; encryptedValue: string; expiresAt?: Date | null }) {
    return prisma.providerCredential.create({ data, select: METADATA_SELECT });
  },

  /** Rotation updates the existing row in place — the (providerConfigId, key) unique constraint means a second ACTIVE row under the same key can never coexist. */
  updateValue(id: string, encryptedValue: string) {
    return prisma.providerCredential.update({
      where: { id },
      data: { encryptedValue, rotatedAt: new Date() },
      select: METADATA_SELECT,
    });
  },

  updateStatus(id: string, status: ProviderCredentialStatus) {
    return prisma.providerCredential.update({ where: { id }, data: { status }, select: METADATA_SELECT });
  },
};
