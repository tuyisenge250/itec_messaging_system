import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/infrastructure/database/prisma";
import { redis } from "@/infrastructure/redis/client";
import { registerUser } from "@/modules/auth/services/auth-service";
import { createOrganization } from "@/modules/organizations/service";
import { sendMessage } from "@/modules/messaging/service";
import { sendMessageSchema } from "@/modules/messaging/validation";
import { authRepository } from "@/modules/auth/repository";
import { RoleName } from "@/shared/constants/roles";
import { sandboxTestNumber } from "@/shared/utils/sandbox";
import type { ActorContext } from "@/shared/types/actor-context";

const runId = Date.now();
const testEmail = (label: string) => `send-message-sender-id-test-${label}-${runId}@example.test`;

async function setupOrg(label: string) {
  const { user } = await registerUser({ email: testEmail(label), password: "CorrectHorse123", name: label }, {});
  const created = await createOrganization({ actorType: "USER", requestId: "test", userId: user.id }, { legalName: `Send Message Sender ID Test Org ${label} ${runId}` });
  const adminRole = await authRepository.findRoleByName(RoleName.ADMIN);
  const actor: ActorContext = { actorType: "USER", requestId: "test", userId: user.id, organizationId: created.id, roleId: adminRole!.id };
  return { actor, organization: created };
}

async function activeSandboxSenderId(organizationId: string) {
  return prisma.senderId.findFirstOrThrow({ where: { organizationId, environment: "SANDBOX", status: "ACTIVE" } });
}

afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});

describe("sendMessage — sender ID by value vs by id", () => {
  it("resolves the sender ID by its unique value (senderId) instead of its internal id", async () => {
    const { actor, organization } = await setupOrg("by-value");
    const senderId = await activeSandboxSenderId(organization.id);

    const result = await sendMessage(actor, organization.id, "SANDBOX", {
      senderId: senderId.value,
      recipients: [sandboxTestNumber("001")],
      content: "sent by sender ID value",
    });
    expect(result.message!.senderIdId).toBe(senderId.id);
  });

  it("still resolves by senderIdId (backward compatible)", async () => {
    const { actor, organization } = await setupOrg("by-id");
    const senderId = await activeSandboxSenderId(organization.id);

    const result = await sendMessage(actor, organization.id, "SANDBOX", {
      senderIdId: senderId.id,
      recipients: [sandboxTestNumber("001")],
      content: "sent by sender ID id",
    });
    expect(result.message!.senderIdId).toBe(senderId.id);
  });

  // These two are enforced by sendMessageSchema's Zod refine at the HTTP/route
  // boundary (app/api/messages/route.ts), not inside sendMessage() itself — so
  // they're tested at that same layer, the same way any other Zod-only
  // constraint in this codebase would be.
  it("schema rejects when both senderIdId and senderId are provided", () => {
    const result = sendMessageSchema.safeParse({
      senderIdId: "some-id",
      senderId: "SOMEVALUE",
      recipients: [sandboxTestNumber("001")],
      content: "ambiguous",
    });
    expect(result.success).toBe(false);
  });

  it("schema rejects when neither senderIdId nor senderId is provided", () => {
    const result = sendMessageSchema.safeParse({
      recipients: [sandboxTestNumber("001")],
      content: "no sender specified",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown sender ID value with not found, not a crash", async () => {
    const { actor, organization } = await setupOrg("unknown-value");

    await expect(
      sendMessage(actor, organization.id, "SANDBOX", {
        senderId: "DOES_NOT_EXIST",
        recipients: [sandboxTestNumber("001")],
        content: "unknown sender",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("a sender ID value from a different organization never resolves — value lookup is scoped per org, not global", async () => {
    const { actor: actorA, organization: orgA } = await setupOrg("cross-org-a");
    const { organization: orgB } = await setupOrg("cross-org-b");

    // A deliberately explicit, distinct value — the two orgs' *auto-provisioned*
    // sandbox sender IDs can otherwise collide (both derive a short code from
    // similar legal names in this test file), which would make this test pass
    // for the wrong reason.
    const distinctValue = `ORGB_${runId}`;
    await prisma.senderId.create({
      data: { organization: { connect: { id: orgB.id } }, environment: "SANDBOX", value: distinctValue, status: "ACTIVE", activatedAt: new Date() },
    });

    // actorA sends as their own org (orgA) but references orgB's sender ID
    // value — must not resolve, even though the string itself is real and active.
    await expect(
      sendMessage(actorA, orgA.id, "SANDBOX", {
        senderId: distinctValue,
        recipients: [sandboxTestNumber("001")],
        content: "cross-org attempt",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
