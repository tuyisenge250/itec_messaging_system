import { prisma } from "@/infrastructure/database/prisma";
import { organizationRepository } from "./repository";
import { gdprRepository } from "./gdpr-repository";
import { documentRepository } from "@/modules/documents/repository";
import { contactRepository } from "@/modules/contacts/repository";
import { campaignRepository } from "@/modules/campaigns/repository";
import { senderIdRepository } from "@/modules/sender-ids/repository";
import { billingRepository } from "@/modules/billing/repository";
import { walletRepository } from "@/modules/wallets/repository";
import { messagingRepository } from "@/modules/messaging/repository";
import { fileStorage } from "@/infrastructure/storage";
import { assertPermission, assertOrganizationAccess } from "@/modules/auth/services/authorization-service";
import { recordAuditEvent } from "@/modules/audit/service";
import { logger } from "@/infrastructure/logging/logger";
import { AppError } from "@/shared/errors/app-error";
import { PermissionCode } from "@/shared/constants/permissions";
import type { ActorContext } from "@/shared/types/actor-context";

const MESSAGE_SAMPLE_SIZE = 200;

/**
 * GDPR-style "right to access" — one JSON bundle of everything this
 * organization's own principal data covers. Message history is capped to a
 * recent sample (exporting an unbounded send history isn't reasonable for a
 * high-volume sender); everything else is exported in full.
 */
export async function exportOrganizationData(actor: ActorContext, organizationId: string) {
  await assertPermission(actor, PermissionCode.ORGANIZATION_EXPORT_DATA);
  assertOrganizationAccess(actor, organizationId);

  const organization = await organizationRepository.findByIdWithDetails(organizationId);
  if (!organization) throw AppError.notFound();

  const [members, documents, contacts, campaigns, senderIds, paymentIntents, recentMessages] = await Promise.all([
    organizationRepository.listMembers(organizationId),
    documentRepository.listForOrganization(organizationId),
    contactRepository.list(organizationId, { take: 10000 }),
    campaignRepository.list(organizationId),
    senderIdRepository.listSenderIdsForOrganization(organizationId),
    billingRepository.listForOrganization(organizationId),
    messagingRepository.listForOrganization(organizationId, { take: MESSAGE_SAMPLE_SIZE }),
  ]);

  const ledgerEntriesByWallet = await Promise.all(
    organization.wallets.map((wallet) => walletRepository.listLedgerEntries(wallet.id, { take: 10000 })),
  );

  await recordAuditEvent({
    actor,
    action: "organization.data_exported",
    resourceType: "Organization",
    resourceId: organizationId,
    organizationId,
  });

  return {
    exportedAt: new Date().toISOString(),
    organization,
    members: members.map((m) => ({ id: m.id, role: m.role.name, status: m.status, user: { id: m.user.id, email: m.user.email, name: m.user.name } })),
    documents,
    contacts: contacts.map((c) => ({
      id: c.id,
      phoneNumber: c.phoneNormalized,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      isSubscribed: c.isSubscribed,
    })),
    campaigns,
    senderIds,
    paymentIntents,
    walletLedgerEntries: organization.wallets.map((wallet, i) => ({ environment: wallet.environment, entries: ledgerEntriesByWallet[i] })),
    messages: { sampleSize: recentMessages.length, note: `Most recent ${MESSAGE_SAMPLE_SIZE} messages only`, sample: recentMessages },
  };
}

/**
 * "Right to erasure" — anonymizes this organization's and its solely-owned
 * members' PII. Financial/audit records are a documented, deliberate
 * exception (GDPR Art. 17(3)(b) legal-obligation carve-out): PaymentIntent,
 * PaymentTransaction, WalletLedgerEntry, Message/MessageRecipient, and
 * AuditEvent are never touched — consistent with this codebase's existing
 * "ledger entries are immutable" rule (see modules/wallets/repository.ts).
 *
 * `confirmName` must match the organization's current legalName exactly —
 * a type-to-confirm safeguard for an irreversible action, same spirit as
 * this session's other high-stakes confirmations (refunds, webhook disable).
 */
export async function eraseOrganizationData(actor: ActorContext, organizationId: string, reason: string, confirmName: string) {
  await assertPermission(actor, PermissionCode.ORGANIZATION_DELETE);
  assertOrganizationAccess(actor, organizationId);

  const organization = await organizationRepository.findById(organizationId);
  if (!organization) throw AppError.notFound();
  if (organization.deletedAt) throw AppError.conflict("This organization has already been erased");
  if (confirmName !== organization.legalName) {
    throw AppError.validation("confirmName must exactly match the organization's current legal name");
  }

  const members = await organizationRepository.listMembers(organizationId);
  const documentsToDelete = await documentRepository.listForOrganization(organizationId);

  await prisma.$transaction(async (tx) => {
    await gdprRepository.revokeAllApiKeys(tx, organizationId);
    await gdprRepository.cancelPendingSenderIdRequests(tx, organizationId);
    await gdprRepository.suspendActiveSenderIds(tx, organizationId);
    await gdprRepository.deleteAllDocuments(tx, organizationId);
    await gdprRepository.deleteAllContactGroups(tx, organizationId);
    await gdprRepository.deleteAllContacts(tx, organizationId);

    for (const membership of members) {
      await gdprRepository.removeMembership(tx, membership.id);
      const otherMemberships = await organizationRepository.countOtherOrganizationMemberships(membership.userId, organizationId);
      if (otherMemberships === 0) {
        await gdprRepository.anonymizeUser(tx, membership.userId);
        await gdprRepository.revokeAllSessionsForUser(tx, membership.userId);
      }
    }

    await gdprRepository.anonymizeOrganization(tx, organizationId);
  });

  // Best-effort — the DB state (source of truth) is already committed;
  // a leftover file on disk is a cleanup nicety, not a correctness issue.
  await Promise.all(
    documentsToDelete.map((doc) =>
      fileStorage.delete(doc.storageKey).catch((err) => logger.error({ err, documentId: doc.id }, "Failed to delete document file during erasure")),
    ),
  );

  await recordAuditEvent({
    actor,
    action: "organization.deleted",
    resourceType: "Organization",
    resourceId: organizationId,
    organizationId,
    metadata: {
      reason,
      retainedForCompliance: ["PaymentIntent", "PaymentTransaction", "WalletLedgerEntry", "Message", "MessageRecipient", "AuditEvent"],
    },
  });
}

