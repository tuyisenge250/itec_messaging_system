import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * Bulk, transaction-scoped operations for GDPR erasure (modules/organizations/gdpr-service.ts).
 * Kept separate from organizations/repository.ts's single-row functions (none of which
 * accept a tx client today) rather than widening their signatures for a rarely-hit,
 * irreversible code path.
 */
export const gdprRepository = {
  revokeAllApiKeys(tx: Tx, organizationId: string) {
    return tx.apiKey.updateMany({
      where: { organizationId, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
  },

  cancelPendingSenderIdRequests(tx: Tx, organizationId: string) {
    return tx.senderIdRequest.updateMany({
      where: { organizationId, status: { notIn: ["APPROVED", "REJECTED", "CANCELLED"] } },
      data: { status: "CANCELLED" },
    });
  },

  suspendActiveSenderIds(tx: Tx, organizationId: string) {
    return tx.senderId.updateMany({
      where: { organizationId, status: "ACTIVE" },
      data: { status: "SUSPENDED", suspendedAt: new Date() },
    });
  },

  listDocuments(tx: Tx, organizationId: string) {
    return tx.document.findMany({ where: { organizationId }, select: { id: true, storageKey: true } });
  },

  deleteAllDocuments(tx: Tx, organizationId: string) {
    return tx.document.deleteMany({ where: { organizationId } });
  },

  // ContactGroupMember rows cascade-delete with their ContactGroup (see schema).
  deleteAllContactGroups(tx: Tx, organizationId: string) {
    return tx.contactGroup.deleteMany({ where: { organizationId } });
  },

  deleteAllContacts(tx: Tx, organizationId: string) {
    return tx.contact.deleteMany({ where: { organizationId } });
  },

  removeMembership(tx: Tx, membershipId: string) {
    return tx.organizationMembership.update({ where: { id: membershipId }, data: { status: "REMOVED" } });
  },

  anonymizeUser(tx: Tx, userId: string) {
    return tx.user.update({
      where: { id: userId },
      data: {
        email: `erased-${userId}@deleted.invalid`,
        name: null,
        // Not a valid argon2 hash — verifyPassword() already treats a malformed
        // hash as a failed verification (see modules/auth/services/password-service.ts),
        // so this can never authenticate; status DISABLED blocks login before that anyway.
        passwordHash: "erased",
        status: "DISABLED",
        deletedAt: new Date(),
      },
    });
  },

  revokeAllSessionsForUser(tx: Tx, userId: string) {
    return tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  },

  anonymizeOrganization(tx: Tx, organizationId: string) {
    return tx.organization.update({
      where: { id: organizationId },
      data: {
        legalName: "Deleted Organization",
        tradingName: null,
        registrationNumber: null,
        tin: null,
        email: null,
        phone: null,
        website: null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        legalRepresentativeName: null,
        legalRepresentativeEmail: null,
        legalRepresentativePhone: null,
        status: "SUSPENDED",
        deletedAt: new Date(),
      },
    });
  },
};
