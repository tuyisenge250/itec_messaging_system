import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/infrastructure/database/prisma";
import { redis } from "@/infrastructure/redis/client";
import { registerUser } from "@/modules/auth/services/auth-service";
import { checkRateLimitBy } from "@/infrastructure/redis/rate-limiter";
import { createOrganization, startActingAsOrganization } from "@/modules/organizations/service";
import { exportOrganizationData, eraseOrganizationData } from "@/modules/organizations/gdpr-service";
import { importContacts } from "@/modules/contacts/service";
import { createAndCompletePaymentIntent } from "@/modules/billing/payment-service";
import { getOrCreateInvoiceForPaymentIntent } from "@/modules/billing/invoice-service";
import { authRepository } from "@/modules/auth/repository";
import { RoleName } from "@/shared/constants/roles";
import type { ActorContext } from "@/shared/types/actor-context";

const runId = Date.now();
const testEmail = (label: string) => `rate-limit-test-${label}-${runId}@example.test`;

async function setupOrg(label: string) {
  const { user } = await registerUser({ email: testEmail(label), password: "CorrectHorse123", name: label }, {});
  const created = await createOrganization({ actorType: "USER", requestId: "test", userId: user.id }, { legalName: `Rate Limit Test Org ${label} ${runId}` });
  const adminRole = await authRepository.findRoleByName(RoleName.ADMIN);
  const actor: ActorContext = { actorType: "USER", requestId: "test", userId: user.id, organizationId: created.id, roleId: adminRole!.id };
  return { user, organization: created, actor };
}

async function setupPlatformAdmin(label: string) {
  const { user } = await registerUser({ email: testEmail(label), password: "CorrectHorse123", name: label }, {});
  await prisma.user.update({ where: { id: user.id }, data: { isPlatformAdmin: true } });
  return { actor: { actorType: "USER", requestId: "test", userId: user.id, isPlatformAdmin: true } as ActorContext };
}

/** Pre-fills the counter to the limit boundary via the same incrementing path checkRateLimit itself uses (so the TTL gets set correctly too), so the next real call is the one that gets rejected — avoids looping through N expensive operations just to prove the guard fires. */
async function exhaustRateLimit(key: string, limit: number) {
  await checkRateLimitBy(key, limit, limit, 60 * 60);
}

afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});

describe("rate limiting on expensive/sensitive endpoints", () => {
  it("GDPR export: allowed under the limit, rejected once exhausted", async () => {
    const { actor, organization } = await setupOrg("export");
    await expect(exportOrganizationData(actor, organization.id)).resolves.toBeDefined();

    await exhaustRateLimit(`gdpr-export:org:${organization.id}`, 5);
    await expect(exportOrganizationData(actor, organization.id)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("GDPR erase: rejected once exhausted", async () => {
    const { actor, organization } = await setupOrg("erase");
    await exhaustRateLimit(`gdpr-erase:org:${organization.id}`, 3);
    await expect(eraseOrganizationData(actor, organization.id, "test", organization.legalName)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("CSV contact import: rejected once exhausted", async () => {
    const { actor, organization } = await setupOrg("csv-import");
    const csv = Buffer.from(["phoneNumber", "+250788600001"].join("\n"));
    await expect(importContacts(actor, organization.id, { csv })).resolves.toBeDefined();

    await exhaustRateLimit(`contacts-import:org:${organization.id}`, 10);
    await expect(importContacts(actor, organization.id, { csv })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("invoice PDF generation: rejected once exhausted", async () => {
    const { actor, organization } = await setupOrg("invoice");
    const intent = await createAndCompletePaymentIntent(
      actor,
      organization.id,
      { environment: "SANDBOX", amountMinorUnits: 1000, simulateOutcome: "SUCCEEDED" },
      `rate-limit-invoice-${runId}`,
    );
    await expect(getOrCreateInvoiceForPaymentIntent(actor, intent.id)).resolves.toBeDefined();

    await exhaustRateLimit(`invoice-pdf:org:${organization.id}`, 30);
    await expect(getOrCreateInvoiceForPaymentIntent(actor, intent.id)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("act-as: rejected once exhausted", async () => {
    const { actor } = await setupPlatformAdmin("act-as");
    const { organization } = await setupOrg("act-as-target");
    await expect(startActingAsOrganization(actor, organization.id)).resolves.toBeDefined();

    await exhaustRateLimit(`act-as:user:${actor.userId}`, 30);
    await expect(startActingAsOrganization(actor, organization.id)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
