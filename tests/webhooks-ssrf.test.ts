import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/infrastructure/database/prisma";
import { redis } from "@/infrastructure/redis/client";
import { registerUser } from "@/modules/auth/services/auth-service";
import { createOrganization } from "@/modules/organizations/service";
import { createWebhook, updateWebhook } from "@/modules/webhooks/service";
import { authRepository } from "@/modules/auth/repository";
import { RoleName } from "@/shared/constants/roles";
import type { ActorContext } from "@/shared/types/actor-context";

const runId = Date.now();
const testEmail = (label: string) => `webhooks-ssrf-test-${label}-${runId}@example.test`;

async function setupOrg(label: string) {
  const { user } = await registerUser({ email: testEmail(label), password: "CorrectHorse123", name: label }, {});
  const created = await createOrganization({ actorType: "USER", requestId: "test", userId: user.id }, { legalName: `Webhooks SSRF Test Org ${label} ${runId}` });
  const adminRole = await authRepository.findRoleByName(RoleName.ADMIN);
  const actor: ActorContext = { actorType: "USER", requestId: "test", userId: user.id, organizationId: created.id, roleId: adminRole!.id };
  return { user, organization: created, actor };
}

afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});

describe("webhook URL SSRF guard", () => {
  it("rejects creating a webhook pointing at a private/loopback address", async () => {
    const { actor, organization } = await setupOrg("create-reject");
    await expect(
      createWebhook(actor, organization.id, { environment: "SANDBOX", url: "https://127.0.0.1/hook", events: ["message.delivered"] }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects creating a webhook pointing at the cloud metadata address", async () => {
    const { actor, organization } = await setupOrg("create-metadata");
    await expect(
      createWebhook(actor, organization.id, {
        environment: "SANDBOX",
        url: "https://169.254.169.254/latest/meta-data/",
        events: ["message.delivered"],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("allows creating a webhook pointing at a public https URL", async () => {
    const { actor, organization } = await setupOrg("create-ok");
    const webhook = await createWebhook(actor, organization.id, {
      environment: "SANDBOX",
      url: "https://example.com/hook",
      events: ["message.delivered"],
    });
    expect(webhook.url).toBe("https://example.com/hook");
  });

  it("rejects updating a webhook's URL to a private address", async () => {
    const { actor, organization } = await setupOrg("update-reject");
    const webhook = await createWebhook(actor, organization.id, {
      environment: "SANDBOX",
      url: "https://example.com/hook",
      events: ["message.delivered"],
    });

    await expect(updateWebhook(actor, organization.id, webhook.id, { url: "https://10.0.0.1/hook" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });
});
