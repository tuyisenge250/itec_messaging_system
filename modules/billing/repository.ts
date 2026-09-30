import { prisma } from "@/infrastructure/database/prisma";
import type { Prisma, Environment, PaymentIntentStatus, PaymentTransactionStatus } from "@/generated/prisma/client";

export const billingRepository = {
  listPackages() {
    return prisma.smsPackage.findMany({ where: { active: true }, orderBy: { priceMinorUnits: "asc" } });
  },

  listAllPackages() {
    return prisma.smsPackage.findMany({ orderBy: { priceMinorUnits: "asc" } });
  },

  findPackageById(id: string) {
    return prisma.smsPackage.findUnique({ where: { id } });
  },

  createPackage(data: Prisma.SmsPackageCreateInput) {
    return prisma.smsPackage.create({ data });
  },

  updatePackage(id: string, data: Prisma.SmsPackageUpdateInput) {
    return prisma.smsPackage.update({ where: { id }, data });
  },

  listAllPricingPlans() {
    return prisma.pricingPlan.findMany({ orderBy: { pricePerSegmentMinorUnits: "asc" } });
  },

  findPricingPlanById(id: string) {
    return prisma.pricingPlan.findUnique({ where: { id } });
  },

  createPricingPlan(data: Prisma.PricingPlanCreateInput, tx: Prisma.TransactionClient | typeof prisma = prisma) {
    return tx.pricingPlan.create({ data });
  },

  updatePricingPlan(id: string, data: Prisma.PricingPlanUpdateInput, tx: Prisma.TransactionClient | typeof prisma = prisma) {
    return tx.pricingPlan.update({ where: { id }, data });
  },

  clearOtherDefaultPlans(excludeId: string, tx: Prisma.TransactionClient | typeof prisma = prisma) {
    return tx.pricingPlan.updateMany({ where: { id: { not: excludeId }, isDefault: true }, data: { isDefault: false } });
  },

  findPaymentIntentByIdempotencyKey(organizationId: string, environment: Environment, idempotencyKey: string) {
    return prisma.paymentIntent.findUnique({
      where: { organizationId_environment_idempotencyKey: { organizationId, environment, idempotencyKey } },
    });
  },

  createPaymentIntent(data: Prisma.PaymentIntentCreateInput, tx: Prisma.TransactionClient | typeof prisma = prisma) {
    return tx.paymentIntent.create({ data });
  },

  updatePaymentIntentStatus(
    tx: Prisma.TransactionClient | typeof prisma,
    id: string,
    status: PaymentIntentStatus,
    extra: { providerReference?: string; completedAt?: Date } = {},
  ) {
    return tx.paymentIntent.update({ where: { id }, data: { status, ...extra } });
  },

  createPaymentTransaction(
    tx: Prisma.TransactionClient | typeof prisma,
    data: {
      paymentIntentId: string;
      providerCode: string;
      requestPayload: Prisma.InputJsonValue;
      responsePayload: Prisma.InputJsonValue;
      status: PaymentTransactionStatus;
      attempt: number;
    },
  ) {
    return tx.paymentTransaction.create({ data });
  },

  findById(id: string) {
    return prisma.paymentIntent.findUnique({ where: { id }, include: { transactions: true, package: true } });
  },

  listForOrganization(organizationId: string, environment?: Environment) {
    return prisma.paymentIntent.findMany({
      where: { organizationId, environment },
      orderBy: { createdAt: "desc" },
    });
  },

  findInvoiceByPaymentIntentId(paymentIntentId: string) {
    return prisma.invoice.findUnique({ where: { paymentIntentId } });
  },

  createInvoice(organizationId: string, paymentIntentId: string) {
    return prisma.invoice.create({ data: { organizationId, paymentIntentId } });
  },
};
