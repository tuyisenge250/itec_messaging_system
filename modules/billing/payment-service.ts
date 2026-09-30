import { prisma } from "@/infrastructure/database/prisma";
import { billingRepository } from "./repository";
import { paymentProvider } from "./providers";
import type { PaymentOutcomeStatus } from "./providers";
import { creditWalletTx } from "@/modules/wallets/service";
import { assertPermission, assertOrganizationAccess, requirePlatformAdmin } from "@/modules/auth/services/authorization-service";
import { recordAuditEvent } from "@/modules/audit/service";
import { notifyUser } from "@/modules/notifications/service";
import { authRepository } from "@/modules/auth/repository";
import { AppError } from "@/shared/errors/app-error";
import { PermissionCode } from "@/shared/constants/permissions";
import { RoleName } from "@/shared/constants/roles";
import type { ActorContext } from "@/shared/types/actor-context";
import type { Environment, PaymentTransactionStatus, Prisma } from "@/generated/prisma/client";

const PROVIDER_CODE = "simulator";

function toTransactionStatus(outcome: PaymentOutcomeStatus): PaymentTransactionStatus {
  if (outcome === "TIMEOUT") return "TIMEOUT";
  if (outcome === "PROVIDER_UNAVAILABLE") return "ERROR";
  return "ACCEPTED";
}

export interface CreatePaymentIntentInput {
  environment: Environment;
  packageId?: string;
  amountMinorUnits?: number;
  simulateOutcome?: PaymentOutcomeStatus;
}

/**
 * Creates (or, on a replayed Idempotency-Key, returns) a PaymentIntent and
 * drives it to completion. A successful charge credits the wallet inside the
 * same transaction that marks the intent SUCCEEDED, so — combined with the
 * (organizationId, environment, idempotencyKey) unique constraint on
 * PaymentIntent — a retried request can never credit the wallet twice.
 */
export async function createAndCompletePaymentIntent(
  actor: ActorContext,
  organizationId: string,
  input: CreatePaymentIntentInput,
  idempotencyKey: string,
) {
  await assertPermission(actor, PermissionCode.WALLET_PURCHASE);
  assertOrganizationAccess(actor, organizationId);

  const existing = await billingRepository.findPaymentIntentByIdempotencyKey(organizationId, input.environment, idempotencyKey);
  if (existing) return existing;

  let amountMinorUnits = input.amountMinorUnits;
  let creditMinorUnits = input.amountMinorUnits;
  let packageId: string | undefined;

  if (input.packageId) {
    const pkg = await billingRepository.findPackageById(input.packageId);
    if (!pkg || !pkg.active) throw AppError.notFound("SMS package not found");
    amountMinorUnits = pkg.priceMinorUnits;
    creditMinorUnits = pkg.creditAmountMinorUnits + pkg.bonusMinorUnits;
    packageId = pkg.id;
  }

  if (!amountMinorUnits || !creditMinorUnits) {
    throw AppError.validation("Unable to resolve a payment amount");
  }

  // Sandbox-only escape hatch for exercising every outcome the simulator supports.
  const simulateOutcome = input.environment === "SANDBOX" ? input.simulateOutcome : undefined;

  const intent = await billingRepository.createPaymentIntent({
    organization: { connect: { id: organizationId } },
    environment: input.environment,
    package: packageId ? { connect: { id: packageId } } : undefined,
    amountMinorUnits,
    providerCode: PROVIDER_CODE,
    idempotencyKey,
    initiatedBy: { connect: { id: actor.userId! } },
    status: "PROCESSING",
  });

  await billingRepository.createPaymentTransaction(prisma, {
    paymentIntentId: intent.id,
    providerCode: PROVIDER_CODE,
    requestPayload: { amountMinorUnits, currency: intent.currency, reference: intent.id },
    responsePayload: {},
    status: "ACCEPTED",
    attempt: 1,
  });

  const chargeResult = await paymentProvider.charge({
    amountMinorUnits,
    currency: intent.currency,
    reference: intent.id,
    simulateOutcome,
  });

  const finalIntent = await prisma.$transaction(async (tx) => {
    await billingRepository.createPaymentTransaction(tx, {
      paymentIntentId: intent.id,
      providerCode: PROVIDER_CODE,
      requestPayload: { reference: intent.id },
      responsePayload: chargeResult.raw as Prisma.InputJsonValue,
      status: toTransactionStatus(chargeResult.status),
      attempt: 2,
    });

    const updated = await billingRepository.updatePaymentIntentStatus(tx, intent.id, chargeResult.status, {
      providerReference: chargeResult.providerReference,
      completedAt: new Date(),
    });

    if (chargeResult.status === "SUCCEEDED") {
      // Defense in depth on top of the (organizationId, environment, idempotencyKey)
      // unique constraint on PaymentIntent: refuse to credit twice for the same intent
      // even if this code path were ever re-entered some other way.
      const alreadyCredited = await tx.walletLedgerEntry.findFirst({
        where: { referenceType: "PAYMENT", referenceId: intent.id, type: "CREDIT" },
        select: { id: true },
      });
      if (alreadyCredited) {
        throw new Error(`PaymentIntent ${intent.id} was already credited (ledger entry ${alreadyCredited.id}) — refusing to credit again`);
      }

      await creditWalletTx(tx, {
        organizationId,
        environment: input.environment,
        amountMinorUnits: creditMinorUnits!,
        type: "CREDIT",
        referenceType: "PAYMENT",
        referenceId: intent.id,
        description: packageId ? `SMS package purchase (${packageId})` : "Wallet top-up",
        createdByUserId: actor.userId,
      });
    }

    return updated;
  });

  await recordAuditEvent({
    actor,
    action: "payment_intent.completed",
    resourceType: "PaymentIntent",
    resourceId: intent.id,
    organizationId,
    metadata: { status: chargeResult.status, amountMinorUnits },
  });

  if (chargeResult.status === "FAILED" || chargeResult.status === "PROVIDER_UNAVAILABLE") {
    const adminRole = await authRepository.findRoleByName(RoleName.ADMIN);
    if (adminRole) {
      const admins = await prisma.organizationMembership.findMany({
        where: { organizationId, roleId: adminRole.id, status: "ACTIVE" },
        select: { userId: true },
      });
      await Promise.all(
        admins.map((m) =>
          notifyUser(m.userId, "PAYMENT", "Payment failed", `A payment of ${amountMinorUnits} ${intent.currency} could not be completed.`, {
            organizationId,
            data: { paymentIntentId: intent.id, status: chargeResult.status },
          }),
        ),
      );
    }
  }

  return finalIntent;
}

export async function getPaymentIntent(actor: ActorContext, id: string) {
  const intent = await billingRepository.findById(id);
  if (!intent) throw AppError.notFound();
  await assertPermission(actor, PermissionCode.WALLET_READ);
  assertOrganizationAccess(actor, intent.organizationId);
  return intent;
}

export function listPackages() {
  return billingRepository.listPackages();
}

export interface SmsPackageInput {
  name: string;
  description?: string;
  priceMinorUnits: number;
  creditAmountMinorUnits: number;
  bonusMinorUnits?: number;
  currency?: string;
  active?: boolean;
}

export type UpdateSmsPackageInput = Partial<SmsPackageInput>;

export async function listPackagesForAdmin(actor: ActorContext) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.PRICING_MANAGE);
  return billingRepository.listAllPackages();
}

export async function createPackage(actor: ActorContext, input: SmsPackageInput) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.PRICING_MANAGE);

  const pkg = await billingRepository.createPackage({
    name: input.name,
    description: input.description,
    priceMinorUnits: input.priceMinorUnits,
    creditAmountMinorUnits: input.creditAmountMinorUnits,
    bonusMinorUnits: input.bonusMinorUnits ?? 0,
    currency: input.currency,
    active: input.active ?? true,
  });

  await recordAuditEvent({
    actor,
    action: "sms_package.created",
    resourceType: "SmsPackage",
    resourceId: pkg.id,
    metadata: { name: input.name, priceMinorUnits: input.priceMinorUnits },
  });

  return pkg;
}

export async function updatePackage(actor: ActorContext, id: string, input: UpdateSmsPackageInput) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.PRICING_MANAGE);

  const existing = await billingRepository.findPackageById(id);
  if (!existing) throw AppError.notFound();

  const pkg = await billingRepository.updatePackage(id, {
    name: input.name,
    description: input.description,
    priceMinorUnits: input.priceMinorUnits,
    creditAmountMinorUnits: input.creditAmountMinorUnits,
    bonusMinorUnits: input.bonusMinorUnits,
    currency: input.currency,
    active: input.active,
  });

  await recordAuditEvent({
    actor,
    action: "sms_package.updated",
    resourceType: "SmsPackage",
    resourceId: id,
    metadata: { changed: Object.keys(input) },
  });

  return pkg;
}

export async function listPaymentIntents(actor: ActorContext, organizationId: string, environment?: Environment) {
  await assertPermission(actor, PermissionCode.WALLET_READ);
  assertOrganizationAccess(actor, organizationId);
  return billingRepository.listForOrganization(organizationId, environment);
}
