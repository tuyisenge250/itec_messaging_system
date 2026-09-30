import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/infrastructure/database/prisma";
import { redis } from "@/infrastructure/redis/client";
import { registerUser } from "@/modules/auth/services/auth-service";
import { createOrganization } from "@/modules/organizations/service";
import { createTemplate } from "@/modules/templates/service";
import { createContactGroup, createContact, addContactToGroup } from "@/modules/contacts/service";
import { createCampaign, sendCampaign, processDueCampaigns, getCampaign } from "@/modules/campaigns/service";
import { authRepository } from "@/modules/auth/repository";
import { RoleName } from "@/shared/constants/roles";
import type { ActorContext } from "@/shared/types/actor-context";

const runId = Date.now();
const testEmail = (label: string) => `recurring-campaigns-test-${label}-${runId}@example.test`;

async function setupCampaignFixture(label: string) {
  const { user } = await registerUser({ email: testEmail(label), password: "CorrectHorse123", name: label }, {});
  const created = await createOrganization({ actorType: "USER", requestId: "test", userId: user.id }, { legalName: `Recurring Campaigns Test Org ${label} ${runId}` });
  const adminRole = await authRepository.findRoleByName(RoleName.ADMIN);
  const actor: ActorContext = { actorType: "USER", requestId: "test", userId: user.id, organizationId: created.id, roleId: adminRole!.id };

  const template = await createTemplate(actor, created.id, { name: `Template ${label}`, content: "Hello from the recurring campaign test" });
  const group = await createContactGroup(actor, created.id, { name: `Group ${label}` });
  const contact = await createContact(actor, created.id, { phoneNumber: "+250788900001" });
  await addContactToGroup(actor, created.id, group.id, contact.id);

  const senderId = created.sandboxOnboarding!.senderId;

  return { actor, organization: created, template, group, senderId };
}

afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});

describe("scheduled and recurring campaigns", () => {
  it("creating a campaign with scheduledAt sets it to SCHEDULED with a matching nextRunAt", async () => {
    const { actor, organization, template, group, senderId } = await setupCampaignFixture("schedule-basic");
    const scheduledAt = new Date(Date.now() + 60_000).toISOString();

    const campaign = await createCampaign(actor, organization.id, "SANDBOX", {
      name: "Scheduled campaign",
      senderIdId: senderId.id,
      templateId: template.id,
      contactGroupId: group.id,
      scheduledAt,
    });

    expect(campaign.status).toBe("SCHEDULED");
    expect(campaign.nextRunAt?.toISOString()).toBe(scheduledAt);
  });

  it("a scheduled campaign in the past is picked up by processDueCampaigns and moves to COMPLETED (non-recurring)", async () => {
    const { actor, organization, template, group, senderId } = await setupCampaignFixture("due-once");
    const pastTime = new Date(Date.now() - 60_000).toISOString();

    const campaign = await createCampaign(actor, organization.id, "SANDBOX", {
      name: "Due campaign",
      senderIdId: senderId.id,
      templateId: template.id,
      contactGroupId: group.id,
      scheduledAt: pastTime,
    });

    const result = await processDueCampaigns();
    expect(result.processed).toBeGreaterThanOrEqual(1);

    const after = await getCampaign(actor, campaign.id);
    expect(after.status).toBe("COMPLETED");
    expect(after.nextRunAt).toBeNull();
    expect(after.totalRecipients).toBe(1);
  });

  it("a recurring campaign reschedules itself to SCHEDULED with an advanced nextRunAt instead of completing", async () => {
    const { actor, organization, template, group, senderId } = await setupCampaignFixture("recurring");
    const pastTime = new Date(Date.now() - 60_000).toISOString();

    const campaign = await createCampaign(actor, organization.id, "SANDBOX", {
      name: "Recurring campaign",
      senderIdId: senderId.id,
      templateId: template.id,
      contactGroupId: group.id,
      scheduledAt: pastTime,
      isRecurring: true,
      recurrenceInterval: "DAILY",
    });
    expect(campaign.isRecurring).toBe(true);

    await processDueCampaigns();

    const after = await getCampaign(actor, campaign.id);
    expect(after.status).toBe("SCHEDULED");
    expect(after.nextRunAt).not.toBeNull();
    expect(after.nextRunAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("a recurring campaign past its recurrenceEndAt completes instead of rescheduling", async () => {
    const { actor, organization, template, group, senderId } = await setupCampaignFixture("recurring-ended");
    const pastTime = new Date(Date.now() - 60_000).toISOString();
    const alreadyPastEnd = new Date(Date.now() - 30_000).toISOString();

    await createCampaign(actor, organization.id, "SANDBOX", {
      name: "Ending recurring campaign",
      senderIdId: senderId.id,
      templateId: template.id,
      contactGroupId: group.id,
      scheduledAt: pastTime,
      isRecurring: true,
      recurrenceInterval: "DAILY",
      recurrenceEndAt: alreadyPastEnd,
    });

    await processDueCampaigns();

    const campaigns = await prisma.campaign.findMany({ where: { organizationId: organization.id } });
    expect(campaigns[0].status).toBe("COMPLETED");
  });

  it("batch numbers keep incrementing across occurrences instead of colliding", async () => {
    const { actor, organization, template, group, senderId } = await setupCampaignFixture("batch-numbering");
    const pastTime = new Date(Date.now() - 60_000).toISOString();

    const campaign = await createCampaign(actor, organization.id, "SANDBOX", {
      name: "Multi-occurrence campaign",
      senderIdId: senderId.id,
      templateId: template.id,
      contactGroupId: group.id,
      scheduledAt: pastTime,
      isRecurring: true,
      recurrenceInterval: "DAILY",
    });

    await processDueCampaigns(); // occurrence 1 -> batch 1, reschedules

    // Force the next occurrence to be due immediately, simulating time passing.
    await prisma.campaign.update({ where: { id: campaign.id }, data: { nextRunAt: new Date(Date.now() - 1000) } });
    await processDueCampaigns(); // occurrence 2 -> should be batch 2, not a collision on batch 1

    const batches = await prisma.campaignBatch.findMany({ where: { campaignId: campaign.id }, orderBy: { batchNumber: "asc" } });
    expect(batches.map((b) => b.batchNumber)).toEqual([1, 2]);
  });

  it("manual sendCampaign still requires DRAFT status — a SCHEDULED campaign can't be sent directly", async () => {
    const { actor, organization, template, group, senderId } = await setupCampaignFixture("manual-send-guard");
    const futureTime = new Date(Date.now() + 60_000).toISOString();

    const campaign = await createCampaign(actor, organization.id, "SANDBOX", {
      name: "Not yet due",
      senderIdId: senderId.id,
      templateId: template.id,
      contactGroupId: group.id,
      scheduledAt: futureTime,
    });

    await expect(sendCampaign(actor, campaign.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
