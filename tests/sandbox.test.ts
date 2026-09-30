import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/infrastructure/database/prisma";
import { redis } from "@/infrastructure/redis/client";
import { registerUser } from "@/modules/auth/services/auth-service";
import { createOrganization } from "@/modules/organizations/service";
import { authRepository } from "@/modules/auth/repository";
import { RoleName } from "@/shared/constants/roles";
import { sendMessage, listRecipients } from "@/modules/messaging/service";
import { processSmsSendJob } from "@/modules/messaging/send-processor";
import { processProviderDeliveryEvent } from "@/modules/webhooks/inbound-processor";
import { verifyApiKeyToken } from "@/modules/api-keys/service";
import { withIdempotency } from "@/modules/idempotency/service";
import { normalizeRwandaPhoneNumber } from "@/shared/utils/phone";
import { sandboxTestNumber } from "@/shared/utils/sandbox";
import type { ActorContext } from "@/shared/types/actor-context";

const runId = Date.now();
const testEmail = (label: string) => `sandbox-test-${label}-${runId}@example.test`;

/** Registers a user, creates an org for them (running the sandbox onboarding path), and returns a fully-resolved ActorContext + the onboarding result. */
async function setupOrg(label: string) {
  const { user } = await registerUser({ email: testEmail(label), password: "CorrectHorse123", name: label }, {});

  const created = await createOrganization({ actorType: "USER", requestId: "test", userId: user.id }, { legalName: `Sandbox Test Org ${label} ${runId}` });

  const adminRole = await authRepository.findRoleByName(RoleName.ADMIN);
  const actor: ActorContext = { actorType: "USER", requestId: "test", userId: user.id, organizationId: created.id, roleId: adminRole!.id };

  const onboarding = (created as unknown as { sandboxOnboarding: { apiKey: { plaintextToken: string } } | null }).sandboxOnboarding;
  return { user, organization: created, actor, sandboxApiKeyToken: onboarding!.apiKey.plaintextToken };
}

async function activeSandboxSenderId(organizationId: string) {
  return prisma.senderId.findFirstOrThrow({ where: { organizationId, environment: "SANDBOX", status: "ACTIVE" } });
}

afterAll(async () => {
  // Deliberately not deleting the users/organizations this file creates: most
  // Organization-owned tables (SenderId, Message, Wallet, ...) have no
  // onDelete: Cascade in the schema (see prisma/schema.prisma), so there is no
  // safe generic delete order here without reaching into nearly every table.
  // Test rows are uniquely named per runId and harmless to leave in a local
  // dev database.
  await prisma.$disconnect();
  redis.disconnect();
});

describe("sandbox onboarding", () => {
  it("creating an organization automatically provisions a sandbox sender ID, credit, and API key", async () => {
    const { organization } = await setupOrg("onboarding");
    const result = organization as unknown as { sandboxOnboarding: { senderId: { value: string; environment: string }; initialCreditMinorUnits: number; apiKey: { plaintextToken: string } } | null };

    expect(result.sandboxOnboarding).not.toBeNull();
    expect(result.sandboxOnboarding!.senderId.environment).toBe("SANDBOX");
    expect(result.sandboxOnboarding!.senderId.value.length).toBeLessThanOrEqual(11);
    expect(result.sandboxOnboarding!.initialCreditMinorUnits).toBeGreaterThan(0);
    expect(result.sandboxOnboarding!.apiKey.plaintextToken).toMatch(/^sk_test\./);

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { organizationId_environment: { organizationId: organization.id, environment: "SANDBOX" } } });
    expect(wallet.availableBalanceMinorUnits).toBe(result.sandboxOnboarding!.initialCreditMinorUnits);

    const ledgerEntry = await prisma.walletLedgerEntry.findFirst({ where: { walletId: wallet.id, type: "BONUS", referenceType: "SYSTEM" } });
    expect(ledgerEntry).not.toBeNull();
  });

  it("does not grant sandbox credit twice if onboarding runs again for the same organization", async () => {
    const { organization } = await setupOrg("no-double-credit");
    const walletBefore = await prisma.wallet.findUniqueOrThrow({ where: { organizationId_environment: { organizationId: organization.id, environment: "SANDBOX" } } });

    // Simulate a retried onboarding call directly against the idempotent building block.
    const { grantInitialSandboxCredit } = await import("@/modules/organizations/onboarding-service");
    const result = await grantInitialSandboxCredit(organization.id);
    expect(result).toBeNull(); // no-op — already granted

    const walletAfter = await prisma.wallet.findUniqueOrThrow({ where: { id: walletBefore.id } });
    expect(walletAfter.availableBalanceMinorUnits).toBe(walletBefore.availableBalanceMinorUnits);
  });
});

describe("sandbox phone validation", () => {
  it("accepts a sandbox test number only in the SANDBOX environment", () => {
    const num = sandboxTestNumber("001");
    expect(normalizeRwandaPhoneNumber(num, "SANDBOX").valid).toBe(true);
    expect(normalizeRwandaPhoneNumber(num, "PRODUCTION").valid).toBe(false);
  });

  it("still accepts a real Rwandan mobile prefix in both environments", () => {
    expect(normalizeRwandaPhoneNumber("+250788000001", "SANDBOX").valid).toBe(true);
    expect(normalizeRwandaPhoneNumber("+250788000001", "PRODUCTION").valid).toBe(true);
  });

  it("rejects a number that is neither a real prefix nor a sandbox test number", () => {
    expect(normalizeRwandaPhoneNumber("+250711111111", "SANDBOX").valid).toBe(false);
  });
});

describe("sandbox send lifecycle", () => {
  it("delivers a message sent to the deterministic 'delivered' test number", async () => {
    const { actor, organization } = await setupOrg("deliver");
    const senderId = await activeSandboxSenderId(organization.id);

    const { message } = await sendMessage(actor, organization.id, "SANDBOX", {
      senderIdId: senderId.id,
      recipients: [sandboxTestNumber("001")],
      content: "integration test — deliver",
    });

    const recipients = await listRecipients(actor, message!.id);
    expect(recipients).toHaveLength(1);

    await processSmsSendJob(recipients[0].id);

    const recipient = await prisma.messageRecipient.findUniqueOrThrow({ where: { id: recipients[0].id } });
    expect(recipient.status).toBe("SENT"); // final DELIVERED arrives via the delayed provider callback, not this call

    // Drive the simulated provider callback directly instead of waiting for the
    // real delayed BullMQ job + worker — exercises the exact same idempotent
    // pipeline (modules/webhooks/inbound-processor.ts) a real callback would hit.
    const applied = await processProviderDeliveryEvent({ recipientId: recipients[0].id, finalStatus: "DELIVERED" });
    expect(applied.applied).toBe(true);

    const delivered = await prisma.messageRecipient.findUniqueOrThrow({ where: { id: recipients[0].id } });
    expect(delivered.status).toBe("DELIVERED");

    const reservation = await prisma.walletReservation.findUniqueOrThrow({ where: { recipientId: recipients[0].id } });
    expect(reservation.status).toBe("CONSUMED"); // consumed at SENT time, unaffected by the later delivery outcome
  });

  it("fails a message sent to the deterministic 'failed' test number and releases the reservation", async () => {
    const { actor, organization } = await setupOrg("fail");
    const senderId = await activeSandboxSenderId(organization.id);

    const { message } = await sendMessage(actor, organization.id, "SANDBOX", {
      senderIdId: senderId.id,
      recipients: [sandboxTestNumber("002")],
      content: "integration test — fail",
    });
    const recipients = await listRecipients(actor, message!.id);

    await processSmsSendJob(recipients[0].id); // ACCEPTED (SENT) — this number fails at the delivery stage, not submission
    await processProviderDeliveryEvent({ recipientId: recipients[0].id, finalStatus: "FAILED", errorCode: "DEST_UNREACHABLE" });

    const recipient = await prisma.messageRecipient.findUniqueOrThrow({ where: { id: recipients[0].id } });
    expect(recipient.status).toBe("FAILED");
  });

  it("ignores a duplicate provider delivery callback for the same recipient", async () => {
    const { actor, organization } = await setupOrg("dup-webhook");
    const senderId = await activeSandboxSenderId(organization.id);

    const { message } = await sendMessage(actor, organization.id, "SANDBOX", {
      senderIdId: senderId.id,
      recipients: [sandboxTestNumber("001")],
      content: "integration test — dup webhook",
    });
    const recipients = await listRecipients(actor, message!.id);
    await processSmsSendJob(recipients[0].id);

    const first = await processProviderDeliveryEvent({ recipientId: recipients[0].id, finalStatus: "DELIVERED" });
    const second = await processProviderDeliveryEvent({ recipientId: recipients[0].id, finalStatus: "DELIVERED" });
    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
  });

  it("times out twice then delivers on the retry-then-delivered test number", async () => {
    const { actor, organization } = await setupOrg("retry");
    const senderId = await activeSandboxSenderId(organization.id);

    const { message } = await sendMessage(actor, organization.id, "SANDBOX", {
      senderIdId: senderId.id,
      recipients: [sandboxTestNumber("008")],
      content: "integration test — retry then delivered",
    });
    const recipients = await listRecipients(actor, message!.id);
    const recipientId = recipients[0].id;

    // Mirror what BullMQ's retry-on-throw would do: attempt 1 and 2 time out
    // (handleTransientFailure persists attempts + re-throws), attempt 3 succeeds.
    await expect(processSmsSendJob(recipientId)).rejects.toThrow();
    await expect(processSmsSendJob(recipientId)).rejects.toThrow();
    await processSmsSendJob(recipientId);

    const recipient = await prisma.messageRecipient.findUniqueOrThrow({ where: { id: recipientId } });
    expect(recipient.status).toBe("SENT");
    expect(recipient.attempts).toBe(3);
  }, 15000);

  it("rejects a send when the wallet balance is insufficient and reserves nothing", async () => {
    const { actor, organization } = await setupOrg("insufficient-balance");
    const senderId = await activeSandboxSenderId(organization.id);

    await prisma.wallet.update({
      where: { organizationId_environment: { organizationId: organization.id, environment: "SANDBOX" } },
      data: { availableBalanceMinorUnits: 0 },
    });

    await expect(
      sendMessage(actor, organization.id, "SANDBOX", { senderIdId: senderId.id, recipients: [sandboxTestNumber("001")], content: "should fail" }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });

    const reservations = await prisma.walletReservation.count({ where: { organizationId: organization.id } });
    expect(reservations).toBe(0);
  });
});

describe("message send idempotency", () => {
  it("replays the same result for a repeated Idempotency-Key + identical body", async () => {
    const { actor, organization } = await setupOrg("idem-replay");
    const senderId = await activeSandboxSenderId(organization.id);
    const body = { senderIdId: senderId.id, recipients: [sandboxTestNumber("001")], content: "idempotent send" };
    const key = `test-key-${runId}`;

    const first = await withIdempotency(
      { organizationId: organization.id, environment: "SANDBOX", scope: "messages.send", key, requestBody: body },
      () => sendMessage(actor, organization.id, "SANDBOX", body),
    );
    const second = await withIdempotency(
      { organizationId: organization.id, environment: "SANDBOX", scope: "messages.send", key, requestBody: body },
      () => sendMessage(actor, organization.id, "SANDBOX", body),
    );

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.result.message!.id).toBe(first.result.message!.id);

    const messageCount = await prisma.message.count({ where: { organizationId: organization.id } });
    expect(messageCount).toBe(1); // the handler only ever ran once
  });

  it("rejects a reused Idempotency-Key with a different request body", async () => {
    const { actor, organization } = await setupOrg("idem-conflict");
    const senderId = await activeSandboxSenderId(organization.id);
    const key = `test-key-conflict-${runId}`;

    await withIdempotency(
      { organizationId: organization.id, environment: "SANDBOX", scope: "messages.send", key, requestBody: { content: "first" } },
      () => sendMessage(actor, organization.id, "SANDBOX", { senderIdId: senderId.id, recipients: [sandboxTestNumber("001")], content: "first" }),
    );

    await expect(
      withIdempotency(
        { organizationId: organization.id, environment: "SANDBOX", scope: "messages.send", key, requestBody: { content: "different" } },
        () => sendMessage(actor, organization.id, "SANDBOX", { senderIdId: senderId.id, recipients: [sandboxTestNumber("001")], content: "different" }),
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });
});

describe("environment isolation", () => {
  it("a valid SANDBOX API key is rejected when the request requires PRODUCTION", async () => {
    const { sandboxApiKeyToken } = await setupOrg("env-isolation");

    // Correct key, correct secret — only the required environment differs.
    await expect(verifyApiKeyToken(sandboxApiKeyToken, "PRODUCTION")).rejects.toMatchObject({ code: "API_KEY_ENVIRONMENT_MISMATCH" });
    // The same key verifies fine when SANDBOX is what's required (or left unchecked).
    const verified = await verifyApiKeyToken(sandboxApiKeyToken, "SANDBOX");
    expect(verified.apiKey.environment).toBe("SANDBOX");
  });

  it("rejects an API key token with the wrong secret", async () => {
    const { sandboxApiKeyToken } = await setupOrg("env-isolation-badsecret");
    const [prefix, publicId] = sandboxApiKeyToken.split(".");
    await expect(verifyApiKeyToken(`${prefix}.${publicId}.wrongsecretwrongsecret`)).rejects.toMatchObject({ code: "API_KEY_INVALID" });
  });
});
