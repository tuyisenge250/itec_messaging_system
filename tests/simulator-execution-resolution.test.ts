import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/infrastructure/database/prisma";
import { redis } from "@/infrastructure/redis/client";
import { registerUser } from "@/modules/auth/services/auth-service";
import { createOrganization } from "@/modules/organizations/service";
import { authRepository } from "@/modules/auth/repository";
import { RoleName } from "@/shared/constants/roles";
import { sendMessage, listRecipients } from "@/modules/messaging/service";
import { processSmsSendJob } from "@/modules/messaging/send-processor";
import { processSmsDeliveryJob } from "@/workers/sms-delivery-worker";
import { queues } from "@/infrastructure/queues/queues";
import { sandboxTestNumber } from "@/shared/utils/sandbox";
import type { ActorContext } from "@/shared/types/actor-context";
import type { SmsDeliveryJobData } from "@/infrastructure/queues/jobs";

const runId = Date.now();
const testEmail = (label: string) => `simulator-execution-test-${label}-${runId}@example.test`;

async function setupOrg(label: string) {
  const { user } = await registerUser({ email: testEmail(label), password: "CorrectHorse123", name: label }, {});
  const created = await createOrganization({ actorType: "USER", requestId: "test", userId: user.id }, { legalName: `Simulator Execution Test Org ${label} ${runId}` });
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

describe("simulator execution resolution (Admin -> Simulator -> Executions)", () => {
  it("a SimulatorExecution starts with finalStatus null, and the scheduled delivery job carries its id", async () => {
    const { actor, organization } = await setupOrg("wiring");
    const senderId = await activeSandboxSenderId(organization.id);

    const { message } = await sendMessage(actor, organization.id, "SANDBOX", {
      senderIdId: senderId.id,
      recipients: [sandboxTestNumber("001")],
      content: "simulator execution resolution test",
    });
    const [recipient] = await listRecipients(actor, message!.id);

    await processSmsSendJob(recipient.id);

    const execution = await prisma.simulatorExecution.findFirstOrThrow({ where: { recipientId: recipient.id } });
    expect(execution.finalStatus).toBeNull(); // not resolved yet — this is the state the bug left it in forever

    const job = await queues.smsDelivery.getJob(`delivery-${recipient.id}`);
    expect(job).toBeDefined();
    expect((job!.data as SmsDeliveryJobData).executionId).toBe(execution.id);
  });

  it("processSmsDeliveryJob resolves the SimulatorExecution's finalStatus and resolvedAt", async () => {
    const { actor, organization } = await setupOrg("resolve-delivered");
    const senderId = await activeSandboxSenderId(organization.id);

    const { message } = await sendMessage(actor, organization.id, "SANDBOX", {
      senderIdId: senderId.id,
      recipients: [sandboxTestNumber("001")], // deterministic "delivered" test number
      content: "simulator execution resolution test — delivered",
    });
    const [recipient] = await listRecipients(actor, message!.id);
    await processSmsSendJob(recipient.id);

    const job = await queues.smsDelivery.getJob(`delivery-${recipient.id}`);
    await processSmsDeliveryJob(job!.data as SmsDeliveryJobData);

    const resolved = await prisma.simulatorExecution.findFirstOrThrow({ where: { recipientId: recipient.id } });
    expect(resolved.finalStatus).toBe("DELIVERED");
    expect(resolved.resolvedAt).not.toBeNull();
  });

  it("resolves to FAILED for the deterministic 'failed' test number", async () => {
    const { actor, organization } = await setupOrg("resolve-failed");
    const senderId = await activeSandboxSenderId(organization.id);

    const { message } = await sendMessage(actor, organization.id, "SANDBOX", {
      senderIdId: senderId.id,
      recipients: [sandboxTestNumber("002")], // deterministic "failed" test number
      content: "simulator execution resolution test — failed",
    });
    const [recipient] = await listRecipients(actor, message!.id);
    await processSmsSendJob(recipient.id);

    const job = await queues.smsDelivery.getJob(`delivery-${recipient.id}`);
    await processSmsDeliveryJob(job!.data as SmsDeliveryJobData);

    const resolved = await prisma.simulatorExecution.findFirstOrThrow({ where: { recipientId: recipient.id } });
    expect(resolved.finalStatus).toBe("FAILED");
  });

  it("processSmsDeliveryJob is a no-op for the simulator-bookkeeping side when executionId is absent (e.g. a real provider callback)", async () => {
    const { actor, organization } = await setupOrg("no-execution-id");
    const senderId = await activeSandboxSenderId(organization.id);

    const { message } = await sendMessage(actor, organization.id, "SANDBOX", {
      senderIdId: senderId.id,
      recipients: [sandboxTestNumber("001")],
      content: "simulator execution resolution test — no executionId",
    });
    const [recipient] = await listRecipients(actor, message!.id);
    await processSmsSendJob(recipient.id);

    // Simulate what a real (non-simulator) provider's inbound webhook payload would look like — no executionId.
    await expect(
      processSmsDeliveryJob({ recipientId: recipient.id, providerMessageId: "real-provider-msg-id", finalStatus: "DELIVERED" }),
    ).resolves.toBeUndefined();

    const recipientRow = await prisma.messageRecipient.findUniqueOrThrow({ where: { id: recipient.id } });
    expect(recipientRow.status).toBe("DELIVERED"); // the real pipeline still applies correctly
  });
});
