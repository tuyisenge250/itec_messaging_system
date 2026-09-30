import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/infrastructure/database/prisma";
import { redis } from "@/infrastructure/redis/client";
import { registerUser } from "@/modules/auth/services/auth-service";
import {
  listPricingPlansForAdmin,
  createPricingPlan,
  updatePricingPlan,
} from "@/modules/billing/pricing-service";
import {
  listPackagesForAdmin,
  createPackage,
  updatePackage,
} from "@/modules/billing/payment-service";
import type { ActorContext } from "@/shared/types/actor-context";

const runId = Date.now();
const testEmail = (label: string) => `admin-pricing-test-${label}-${runId}@example.test`;
const PASSWORD = "CorrectHorse123";

async function setupPlatformAdmin(label: string) {
  const { user } = await registerUser({ email: testEmail(label), password: PASSWORD, name: label }, {});
  await prisma.user.update({ where: { id: user.id }, data: { isPlatformAdmin: true } });
  const actor: ActorContext = { actorType: "USER", requestId: "test", userId: user.id, isPlatformAdmin: true };
  return { user, actor };
}

afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});

describe("admin pricing plan management", () => {
  it("creates a pricing plan and lists it back", async () => {
    const { actor: admin } = await setupPlatformAdmin("create-plan-admin");

    const plan = await createPricingPlan(admin, {
      name: `Standard ${runId}`,
      pricePerSegmentMinorUnits: 12,
      currency: "RWF",
    });
    expect(plan.pricePerSegmentMinorUnits).toBe(12);
    expect(plan.isDefault).toBe(false);
    expect(plan.active).toBe(true);

    const plans = await listPricingPlansForAdmin(admin);
    expect(plans.some((p) => p.id === plan.id)).toBe(true);
  });

  it("listPricingPlansForAdmin includes inactive plans (unlike the customer-facing listing)", async () => {
    const { actor: admin } = await setupPlatformAdmin("list-inactive-plan-admin");

    const plan = await createPricingPlan(admin, {
      name: `Retired ${runId}`,
      pricePerSegmentMinorUnits: 20,
      active: false,
    });

    const plans = await listPricingPlansForAdmin(admin);
    expect(plans.some((p) => p.id === plan.id && p.active === false)).toBe(true);
  });

  it("updates a pricing plan's tunable fields", async () => {
    const { actor: admin } = await setupPlatformAdmin("update-plan-admin");
    const plan = await createPricingPlan(admin, { name: `To Update ${runId}`, pricePerSegmentMinorUnits: 8 });

    const updated = await updatePricingPlan(admin, plan.id, { pricePerSegmentMinorUnits: 9, active: false });
    expect(updated.pricePerSegmentMinorUnits).toBe(9);
    expect(updated.active).toBe(false);
  });

  it("updating a nonexistent plan is rejected as not found", async () => {
    const { actor: admin } = await setupPlatformAdmin("update-missing-plan-admin");
    await expect(updatePricingPlan(admin, "nonexistent-plan-id", { active: false })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("marking a plan as default clears every other plan's default flag — only one default can exist", async () => {
    const { actor: admin } = await setupPlatformAdmin("default-invariant-admin");
    const previousDefault = await prisma.pricingPlan.findFirst({ where: { isDefault: true } });
    let planAId: string | undefined;
    let planBId: string | undefined;

    try {
      const planA = await createPricingPlan(admin, { name: `Default A ${runId}`, pricePerSegmentMinorUnits: 10, isDefault: true });
      planAId = planA.id;
      expect(planA.isDefault).toBe(true);

      const planB = await createPricingPlan(admin, { name: `Default B ${runId}`, pricePerSegmentMinorUnits: 15, isDefault: true });
      planBId = planB.id;
      expect(planB.isDefault).toBe(true);

      const refreshedA = await prisma.pricingPlan.findUnique({ where: { id: planA.id } });
      expect(refreshedA?.isDefault).toBe(false);

      // Flipping an existing (non-default) plan to default should also demote planB.
      const promoted = await updatePricingPlan(admin, planA.id, { isDefault: true });
      expect(promoted.isDefault).toBe(true);
      const refreshedB = await prisma.pricingPlan.findUnique({ where: { id: planB.id } });
      expect(refreshedB?.isDefault).toBe(false);
    } finally {
      if (planAId) await prisma.pricingPlan.update({ where: { id: planAId }, data: { isDefault: false } }).catch(() => {});
      if (planBId) await prisma.pricingPlan.update({ where: { id: planBId }, data: { isDefault: false } }).catch(() => {});
      if (previousDefault) {
        await prisma.pricingPlan.update({ where: { id: previousDefault.id }, data: { isDefault: true } });
      }
    }
  });

  it("a non-platform-admin actor is forbidden from managing pricing plans", async () => {
    const { user: plainUser } = await registerUser({ email: testEmail("plain-plan"), password: PASSWORD, name: "plain" }, {});
    const plainActor: ActorContext = { actorType: "USER", requestId: "test", userId: plainUser.id };

    await expect(listPricingPlansForAdmin(plainActor)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createPricingPlan(plainActor, { name: "x", pricePerSegmentMinorUnits: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("admin SMS package management", () => {
  it("creates a package and lists it back", async () => {
    const { actor: admin } = await setupPlatformAdmin("create-package-admin");

    const pkg = await createPackage(admin, {
      name: `Starter ${runId}`,
      priceMinorUnits: 5000,
      creditAmountMinorUnits: 5000,
      bonusMinorUnits: 500,
    });
    expect(pkg.bonusMinorUnits).toBe(500);
    expect(pkg.active).toBe(true);

    const packages = await listPackagesForAdmin(admin);
    expect(packages.some((p) => p.id === pkg.id)).toBe(true);
  });

  it("listPackagesForAdmin includes inactive packages (unlike the customer-facing listing)", async () => {
    const { actor: admin } = await setupPlatformAdmin("list-inactive-package-admin");

    const pkg = await createPackage(admin, {
      name: `Discontinued ${runId}`,
      priceMinorUnits: 1000,
      creditAmountMinorUnits: 1000,
      active: false,
    });

    const packages = await listPackagesForAdmin(admin);
    expect(packages.some((p) => p.id === pkg.id && p.active === false)).toBe(true);
  });

  it("updates a package's price and active status", async () => {
    const { actor: admin } = await setupPlatformAdmin("update-package-admin");
    const pkg = await createPackage(admin, { name: `To Update ${runId}`, priceMinorUnits: 2000, creditAmountMinorUnits: 2000 });

    const updated = await updatePackage(admin, pkg.id, { priceMinorUnits: 2500, active: false });
    expect(updated.priceMinorUnits).toBe(2500);
    expect(updated.active).toBe(false);
  });

  it("updating a nonexistent package is rejected as not found", async () => {
    const { actor: admin } = await setupPlatformAdmin("update-missing-package-admin");
    await expect(updatePackage(admin, "nonexistent-package-id", { active: false })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("a non-platform-admin actor is forbidden from managing packages", async () => {
    const { user: plainUser } = await registerUser({ email: testEmail("plain-package"), password: PASSWORD, name: "plain" }, {});
    const plainActor: ActorContext = { actorType: "USER", requestId: "test", userId: plainUser.id };

    await expect(listPackagesForAdmin(plainActor)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      createPackage(plainActor, { name: "x", priceMinorUnits: 100, creditAmountMinorUnits: 100 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
