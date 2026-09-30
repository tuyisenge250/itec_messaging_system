import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/infrastructure/database/prisma";
import { redis } from "@/infrastructure/redis/client";
import { registerUser } from "@/modules/auth/services/auth-service";
import { createOrganization } from "@/modules/organizations/service";
import { createAndCompletePaymentIntent } from "@/modules/billing/payment-service";
import { getOrCreateInvoiceForPaymentIntent } from "@/modules/billing/invoice-service";
import { authRepository } from "@/modules/auth/repository";
import { RoleName } from "@/shared/constants/roles";
import type { ActorContext } from "@/shared/types/actor-context";

const runId = Date.now();
const testEmail = (label: string) => `invoices-test-${label}-${runId}@example.test`;

async function setupOrg(label: string) {
  const { user } = await registerUser({ email: testEmail(label), password: "CorrectHorse123", name: label }, {});
  const created = await createOrganization({ actorType: "USER", requestId: "test", userId: user.id }, { legalName: `Invoices Test Org ${label} ${runId}` });
  const adminRole = await authRepository.findRoleByName(RoleName.ADMIN);
  const actor: ActorContext = { actorType: "USER", requestId: "test", userId: user.id, organizationId: created.id, roleId: adminRole!.id };
  return { user, organization: created, actor };
}

afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});

describe("invoice generation", () => {
  it("generates a PDF for a succeeded payment, with a real invoice number", async () => {
    const { actor, organization } = await setupOrg("succeeded");
    const intent = await createAndCompletePaymentIntent(
      actor,
      organization.id,
      { environment: "SANDBOX", amountMinorUnits: 5000, simulateOutcome: "SUCCEEDED" },
      `invoice-test-${runId}-a`,
    );
    expect(intent.status).toBe("SUCCEEDED");

    const { invoiceNumber, pdf } = await getOrCreateInvoiceForPaymentIntent(actor, intent.id);
    expect(invoiceNumber).toMatch(/^INV-\d{6}$/);
    expect(pdf.length).toBeGreaterThan(0);
    expect(pdf.subarray(0, 4).toString("ascii")).toBe("%PDF"); // real PDF magic bytes, not a stub
  });

  it("is idempotent — downloading twice returns the same invoice number", async () => {
    const { actor, organization } = await setupOrg("idempotent");
    const intent = await createAndCompletePaymentIntent(
      actor,
      organization.id,
      { environment: "SANDBOX", amountMinorUnits: 3000, simulateOutcome: "SUCCEEDED" },
      `invoice-test-${runId}-b`,
    );

    const first = await getOrCreateInvoiceForPaymentIntent(actor, intent.id);
    const second = await getOrCreateInvoiceForPaymentIntent(actor, intent.id);
    expect(second.invoiceNumber).toBe(first.invoiceNumber);

    const rows = await prisma.invoice.findMany({ where: { paymentIntentId: intent.id } });
    expect(rows).toHaveLength(1);
  });

  it("refuses to generate an invoice for a payment that hasn't succeeded", async () => {
    const { actor, organization } = await setupOrg("failed");
    const intent = await createAndCompletePaymentIntent(
      actor,
      organization.id,
      { environment: "SANDBOX", amountMinorUnits: 1000, simulateOutcome: "FAILED" },
      `invoice-test-${runId}-c`,
    );
    expect(intent.status).toBe("FAILED");

    await expect(getOrCreateInvoiceForPaymentIntent(actor, intent.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("a different organization's actor cannot fetch this invoice", async () => {
    const { actor, organization } = await setupOrg("owner");
    const { actor: otherActor } = await setupOrg("intruder");
    const intent = await createAndCompletePaymentIntent(
      actor,
      organization.id,
      { environment: "SANDBOX", amountMinorUnits: 1000, simulateOutcome: "SUCCEEDED" },
      `invoice-test-${runId}-d`,
    );

    await expect(getOrCreateInvoiceForPaymentIntent(otherActor, intent.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
