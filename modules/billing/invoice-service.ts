import { billingRepository } from "./repository";
import { organizationRepository } from "@/modules/organizations/repository";
import { generateInvoicePdf } from "./pdf-generator";
import { assertOrganizationAccess } from "@/modules/auth/services/authorization-service";
import { AppError } from "@/shared/errors/app-error";
import type { ActorContext } from "@/shared/types/actor-context";

function formatInvoiceNumber(sequence: number): string {
  return `INV-${String(sequence).padStart(6, "0")}`;
}

/**
 * Invoices are created lazily, the first time anyone downloads a receipt for
 * a successful payment — not eagerly at payment-success time — since not
 * every payment needs one printed. `paymentIntentId` is unique, so this is
 * idempotent: a second download reuses the same invoice/sequence number.
 */
export async function getOrCreateInvoiceForPaymentIntent(actor: ActorContext, paymentIntentId: string) {
  const intent = await billingRepository.findById(paymentIntentId);
  if (!intent) throw AppError.notFound("Payment not found");
  assertOrganizationAccess(actor, intent.organizationId);

  if (intent.status !== "SUCCEEDED") {
    throw AppError.conflict("Only a succeeded payment has an invoice");
  }

  const existing = await billingRepository.findInvoiceByPaymentIntentId(paymentIntentId);
  const invoice = existing ?? (await billingRepository.createInvoice(intent.organizationId, paymentIntentId));

  const organization = await organizationRepository.findById(intent.organizationId);
  if (!organization) throw AppError.notFound("Organization not found");

  const address = [organization.addressLine1, organization.addressLine2, organization.city].filter(Boolean).join(", ") || null;

  const pdf = await generateInvoicePdf({
    invoiceNumber: formatInvoiceNumber(invoice.sequence),
    createdAt: invoice.createdAt,
    organizationName: organization.legalName,
    organizationAddress: address,
    description: intent.package ? `SMS package: ${intent.package.name}` : "Wallet top-up",
    amountMinorUnits: intent.amountMinorUnits,
    currency: intent.currency,
    providerReference: intent.providerReference,
  });

  return { invoiceNumber: formatInvoiceNumber(invoice.sequence), pdf };
}
