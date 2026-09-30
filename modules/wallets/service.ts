import { prisma } from "@/infrastructure/database/prisma";
import { walletRepository } from "./repository";
import { assertPermission, assertOrganizationAccess } from "@/modules/auth/services/authorization-service";
import { recordAuditEvent } from "@/modules/audit/service";
import { AppError } from "@/shared/errors/app-error";
import { ErrorCode } from "@/shared/errors/error-codes";
import { PermissionCode } from "@/shared/constants/permissions";
import type { ActorContext } from "@/shared/types/actor-context";
import type { Environment, Prisma } from "@/generated/prisma/client";

/**
 * Ledger sign convention: `amountMinorUnits` is the signed delta this entry
 * applies to whichever balance it primarily concerns (available for
 * CREDIT/BONUS/REFUND/ADJUSTMENT/RESERVATION/RESERVATION_RELEASE, reserved
 * for SMS_USAGE). The authoritative running balances are always
 * `balanceAfterMinorUnits`/`reservedAfterMinorUnits`, captured atomically in
 * the same transaction as the balance change — a reader reconstructing
 * history should trust those snapshots over re-summing `amountMinorUnits`.
 */

export async function getWallet(actor: ActorContext, organizationId: string, environment: Environment) {
  await assertPermission(actor, PermissionCode.WALLET_READ);
  assertOrganizationAccess(actor, organizationId);

  const wallet = await walletRepository.findByOrgEnv(organizationId, environment);
  if (!wallet) throw AppError.notFound("Wallet not found");
  return wallet;
}

export async function listWalletTransactions(
  actor: ActorContext,
  organizationId: string,
  environment: Environment,
  cursor?: string,
) {
  await assertPermission(actor, PermissionCode.WALLET_READ);
  assertOrganizationAccess(actor, organizationId);

  const wallet = await walletRepository.findByOrgEnv(organizationId, environment);
  if (!wallet) throw AppError.notFound("Wallet not found");
  return walletRepository.listLedgerEntries(wallet.id, { take: 50, cursor });
}

/**
 * Reserves credits for a single message recipient. Must be called inside the
 * caller's own transaction (the same one that creates the Message/
 * MessageRecipient rows + outbox event) so a failed reservation rolls back
 * the whole send attempt atomically — see modules/messaging/service.ts.
 */
export async function reserveForRecipient(
  tx: Prisma.TransactionClient,
  params: { organizationId: string; walletId: string; recipientId: string; amountMinorUnits: number; currency: string },
) {
  const wallet = await walletRepository.tryReserve(tx, params.walletId, params.amountMinorUnits);
  if (!wallet) {
    throw AppError.of(ErrorCode.INSUFFICIENT_BALANCE, "Insufficient SMS credits", 402);
  }

  await walletRepository.createLedgerEntry(tx, {
    walletId: wallet.id,
    organizationId: params.organizationId,
    type: "RESERVATION",
    amountMinorUnits: -params.amountMinorUnits,
    balanceAfterMinorUnits: wallet.availableBalanceMinorUnits,
    reservedAfterMinorUnits: wallet.reservedBalanceMinorUnits,
    referenceType: "MESSAGE_RECIPIENT",
    referenceId: params.recipientId,
  });

  await walletRepository.createReservation(tx, {
    walletId: wallet.id,
    organizationId: params.organizationId,
    recipientId: params.recipientId,
    amountMinorUnits: params.amountMinorUnits,
    currency: params.currency,
  });

  return wallet;
}

/** Called once a recipient's send outcome is known: SENT/ACCEPTED -> consume, rejected pre-submission -> release. */
export async function resolveReservationForRecipient(recipientId: string, outcome: "CONSUMED" | "RELEASED") {
  await prisma.$transaction(async (tx) => {
    const reservation = await walletRepository.findReservationByRecipientId(recipientId, tx);
    if (!reservation || reservation.status !== "RESERVED") return; // already resolved or none — idempotent no-op

    const wallet =
      outcome === "CONSUMED"
        ? await walletRepository.consumeReserved(tx, reservation.walletId, reservation.amountMinorUnits)
        : await walletRepository.release(tx, reservation.walletId, reservation.amountMinorUnits);

    await walletRepository.createLedgerEntry(tx, {
      walletId: wallet.id,
      organizationId: reservation.organizationId,
      type: outcome === "CONSUMED" ? "SMS_USAGE" : "RESERVATION_RELEASE",
      amountMinorUnits: outcome === "CONSUMED" ? -reservation.amountMinorUnits : reservation.amountMinorUnits,
      balanceAfterMinorUnits: wallet.availableBalanceMinorUnits,
      reservedAfterMinorUnits: wallet.reservedBalanceMinorUnits,
      referenceType: "MESSAGE_RECIPIENT",
      referenceId: recipientId,
    });

    await walletRepository.resolveReservation(tx, reservation.id, outcome);
  });
}

/** Credits a wallet (payment success, bonus, refund, admin adjustment). */
export interface CreditWalletParams {
  organizationId: string;
  environment: Environment;
  amountMinorUnits: number;
  type: "CREDIT" | "BONUS" | "REFUND" | "ADJUSTMENT";
  referenceType?: "PAYMENT" | "MANUAL" | "SYSTEM";
  referenceId?: string;
  description?: string;
  createdByUserId?: string;
}

/**
 * Does the actual crediting against a caller-supplied transaction client —
 * used when the credit must be atomic with other writes the caller is
 * already doing (e.g. payment-service marking a PaymentIntent SUCCEEDED in
 * the same transaction it credits the wallet in). Nesting a fresh
 * `prisma.$transaction()` inside an already-open one would not participate
 * in that outer transaction, so this variant is the one to use from inside
 * another transaction; `creditWallet` below is the standalone convenience
 * wrapper for callers that aren't already in one.
 */
export async function creditWalletTx(tx: Prisma.TransactionClient, params: CreditWalletParams) {
  const walletBefore = await walletRepository.findByOrgEnv(params.organizationId, params.environment, tx);
  if (!walletBefore) throw AppError.notFound("Wallet not found");

  const wallet = await walletRepository.credit(tx, walletBefore.id, params.amountMinorUnits);

  await walletRepository.createLedgerEntry(tx, {
    walletId: wallet.id,
    organizationId: params.organizationId,
    type: params.type,
    amountMinorUnits: params.amountMinorUnits,
    balanceAfterMinorUnits: wallet.availableBalanceMinorUnits,
    reservedAfterMinorUnits: wallet.reservedBalanceMinorUnits,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    description: params.description,
    createdByUserId: params.createdByUserId,
  });

  return wallet;
}

export async function creditWallet(params: CreditWalletParams) {
  return prisma.$transaction((tx) => creditWalletTx(tx, params));
}

export async function adjustWallet(
  actor: ActorContext,
  organizationId: string,
  environment: Environment,
  amountMinorUnits: number,
  description: string,
) {
  await assertPermission(actor, PermissionCode.WALLET_ADJUST);

  const wallet = await creditWallet({
    organizationId,
    environment,
    amountMinorUnits,
    type: "ADJUSTMENT",
    referenceType: "MANUAL",
    description,
    createdByUserId: actor.userId,
  });

  await recordAuditEvent({
    actor,
    action: "wallet.adjusted",
    resourceType: "Wallet",
    resourceId: wallet.id,
    organizationId,
    metadata: { amountMinorUnits, description },
  });

  return wallet;
}
