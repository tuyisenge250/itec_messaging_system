import { prisma } from "@/infrastructure/database/prisma";
import { env } from "@/infrastructure/config/env";
import { walletRepository } from "@/modules/wallets/repository";
import { createApiKey } from "@/modules/api-keys/service";
import { getSettingValue } from "@/modules/settings/service";
import { PermissionCode } from "@/shared/constants/permissions";
import { generateSandboxSenderIdValue } from "@/shared/utils/sandbox";
import type { Prisma, SenderId, ApiKey } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient | typeof prisma;

const SANDBOX_API_KEY_SCOPES: PermissionCode[] = [
  PermissionCode.SMS_SEND,
  PermissionCode.SMS_READ,
  PermissionCode.SMS_CANCEL,
  PermissionCode.CAMPAIGN_CREATE,
  PermissionCode.CAMPAIGN_SEND,
  PermissionCode.CAMPAIGN_READ,
  PermissionCode.CAMPAIGN_CANCEL,
  PermissionCode.CONTACTS_READ,
  PermissionCode.CONTACTS_MANAGE,
  PermissionCode.TEMPLATES_MANAGE,
  PermissionCode.WALLET_READ,
  PermissionCode.WALLET_PURCHASE,
  PermissionCode.SENDER_ID_READ,
  PermissionCode.WEBHOOK_MANAGE,
  PermissionCode.API_KEY_READ,
];

/**
 * Creates (once) the organization's automatic sandbox sender ID. Unlike
 * production, this bypasses the SenderIdRequest review/RURA workflow
 * entirely — sandbox never simulates real regulatory approval (see
 * docs/sandbox.md and modules/sender-ids/service.ts::approveSenderIdRequest
 * for the real workflow this deliberately skips).
 */
export async function ensureSandboxSenderId(organizationId: string, legalName: string, tx: Tx = prisma): Promise<SenderId> {
  const value = generateSandboxSenderIdValue(legalName);

  const existing = await tx.senderId.findUnique({
    where: { organizationId_value_environment: { organizationId, value, environment: "SANDBOX" } },
  });
  if (existing) return existing;

  return tx.senderId.create({
    data: { organizationId, environment: "SANDBOX", value, status: "ACTIVE", activatedAt: new Date() },
  });
}

/**
 * Grants the one-time sandbox starting balance as a BONUS/SYSTEM ledger
 * entry (never a fake PaymentIntent — see docs/sandbox.md). Idempotent: if
 * this organization's sandbox wallet already has a SYSTEM-bonus onboarding
 * entry, does nothing and returns null, so re-running onboarding (or a
 * retried request) can never grant it twice.
 */
export async function grantInitialSandboxCredit(organizationId: string, tx: Tx = prisma, creditAmount?: number) {
  const amount = creditAmount ?? (await getSettingValue("SANDBOX_INITIAL_CREDIT_MINOR_UNITS", env.SANDBOX_INITIAL_CREDIT_MINOR_UNITS));
  if (amount <= 0) return null;

  const wallet = await walletRepository.findByOrgEnv(organizationId, "SANDBOX", tx);
  if (!wallet) throw new Error(`No SANDBOX wallet found for organization ${organizationId} — ensureWallet must run first`);

  const alreadyGranted = await tx.walletLedgerEntry.findFirst({
    where: { walletId: wallet.id, type: "BONUS", referenceType: "SYSTEM", referenceId: "sandbox-onboarding" },
    select: { id: true },
  });
  if (alreadyGranted) return null;

  const credited = await walletRepository.credit(tx, wallet.id, amount);
  await walletRepository.createLedgerEntry(tx, {
    walletId: credited.id,
    organizationId,
    type: "BONUS",
    amountMinorUnits: amount,
    balanceAfterMinorUnits: credited.availableBalanceMinorUnits,
    reservedAfterMinorUnits: credited.reservedBalanceMinorUnits,
    referenceType: "SYSTEM",
    referenceId: "sandbox-onboarding",
    description: "Initial sandbox testing credits",
  });

  return credited;
}

/**
 * Creates the organization's automatic sandbox API key. Not idempotent by
 * design (an API key is a distinct secret each time) — callers should only
 * invoke this once per organization, at creation time; see
 * createOrganization in ./service.ts.
 */
export async function createSandboxApiKey(organizationId: string, createdByUserId: string, tx: Tx = prisma) {
  return createApiKey(
    {
      organizationId,
      environment: "SANDBOX",
      name: "Sandbox onboarding key",
      scopes: SANDBOX_API_KEY_SCOPES,
      createdByUserId,
    },
    tx,
  );
}

export interface SandboxOnboardingResult {
  senderId: SenderId;
  initialCreditMinorUnits: number;
  apiKey: { record: ApiKey; plaintextToken: string };
}

/**
 * Full automatic sandbox provisioning (spec: "Organization created ->
 * SANDBOX environment initialized -> default sandbox Sender ID -> sandbox
 * wallet -> sandbox test credits -> sandbox API key -> ready to send").
 * Must run inside the same transaction that creates the organization's
 * SANDBOX wallet (see modules/organizations/service.ts::createOrganization)
 * so provisioning is all-or-nothing with the organization itself.
 */
export async function provisionSandboxOnboarding(
  tx: Tx,
  organizationId: string,
  legalName: string,
  createdByUserId: string,
): Promise<SandboxOnboardingResult> {
  const creditAmount = await getSettingValue("SANDBOX_INITIAL_CREDIT_MINOR_UNITS", env.SANDBOX_INITIAL_CREDIT_MINOR_UNITS);
  const senderId = await ensureSandboxSenderId(organizationId, legalName, tx);
  await grantInitialSandboxCredit(organizationId, tx, creditAmount);
  const apiKey = await createSandboxApiKey(organizationId, createdByUserId, tx);

  return { senderId, initialCreditMinorUnits: creditAmount, apiKey };
}
