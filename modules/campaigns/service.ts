import { prisma } from "@/infrastructure/database/prisma";
import { campaignRepository } from "./repository";
import { contactRepository } from "@/modules/contacts/repository";
import { templateRepository } from "@/modules/templates/repository";
import { sendMessage } from "@/modules/messaging/service";
import { assertPermission, assertOrganizationAccess, assertResourceBelongsToOrganization } from "@/modules/auth/services/authorization-service";
import { recordAuditEvent } from "@/modules/audit/service";
import { AppError } from "@/shared/errors/app-error";
import { PermissionCode } from "@/shared/constants/permissions";
import { SYSTEM_ACTOR, type ActorContext } from "@/shared/types/actor-context";
import type { z } from "zod";
import type { createCampaignSchema } from "./validation";
import type { Environment, Campaign, RecurrenceInterval } from "@/generated/prisma/client";

const DEFAULT_BATCH_SIZE = 1000;

export async function createCampaign(actor: ActorContext, organizationId: string, environment: Environment, input: z.infer<typeof createCampaignSchema>) {
  await assertPermission(actor, PermissionCode.CAMPAIGN_CREATE);
  assertOrganizationAccess(actor, organizationId);
  if (!actor.userId) throw AppError.unauthenticated();

  const group = await contactRepository.findGroupById(input.contactGroupId);
  assertResourceBelongsToOrganization(group?.organizationId, organizationId);

  const template = await templateRepository.findById(input.templateId);
  assertResourceBelongsToOrganization(template?.organizationId, organizationId);

  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : undefined;

  return campaignRepository.create({
    organization: { connect: { id: organizationId } },
    environment,
    name: input.name,
    senderId: { connect: { id: input.senderIdId } },
    template: { connect: { id: input.templateId } },
    contactGroup: { connect: { id: input.contactGroupId } },
    batchSize: input.batchSize ?? DEFAULT_BATCH_SIZE,
    // Setting scheduledAt alone (no recurrence) is a plain "send later" —
    // status SCHEDULED + nextRunAt is what the poller (processDueCampaigns)
    // actually watches; scheduledAt itself is just the record of what was requested.
    scheduledAt,
    status: scheduledAt ? "SCHEDULED" : undefined,
    nextRunAt: scheduledAt,
    isRecurring: input.isRecurring ?? false,
    recurrenceInterval: input.recurrenceInterval,
    recurrenceEndAt: input.recurrenceEndAt ? new Date(input.recurrenceEndAt) : undefined,
    createdBy: { connect: { id: actor.userId } },
  });
}

export async function listCampaigns(actor: ActorContext, organizationId: string) {
  await assertPermission(actor, PermissionCode.CAMPAIGN_READ);
  assertOrganizationAccess(actor, organizationId);
  return campaignRepository.list(organizationId);
}

export async function getCampaign(actor: ActorContext, id: string) {
  const campaign = await campaignRepository.findById(id);
  if (!campaign) throw AppError.notFound();
  await assertPermission(actor, PermissionCode.CAMPAIGN_READ);
  assertOrganizationAccess(actor, campaign.organizationId);

  // Campaign has no aggregate-count columns of its own — each batch's Message row
  // already tracks its own recipient-status counts, so sum across batches rather
  // than inventing a number. Real data from real rows, not a display-only guess.
  const stats = campaign.batches.reduce(
    (acc, batch) => {
      if (!batch.message) return acc;
      acc.queued += batch.message.queuedCount;
      acc.processing += batch.message.processingCount;
      acc.sent += batch.message.sentCount;
      acc.delivered += batch.message.deliveredCount;
      acc.failed += batch.message.failedCount;
      acc.totalCostMinorUnits += batch.message.totalCostMinorUnits;
      return acc;
    },
    { queued: 0, processing: 0, sent: 0, delivered: 0, failed: 0, totalCostMinorUnits: 0 },
  );

  return { ...campaign, stats };
}

export async function updateCampaign(
  actor: ActorContext,
  id: string,
  input: {
    name?: string;
    batchSize?: number;
    scheduledAt?: string;
    isRecurring?: boolean;
    recurrenceInterval?: RecurrenceInterval;
    recurrenceEndAt?: string;
  },
) {
  await assertPermission(actor, PermissionCode.CAMPAIGN_CREATE);
  const campaign = await campaignRepository.findById(id);
  if (!campaign) throw AppError.notFound();
  assertOrganizationAccess(actor, campaign.organizationId);

  if (campaign.status !== "DRAFT") {
    throw AppError.conflict("Only a draft campaign can be edited");
  }

  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : undefined;

  return campaignRepository.update(id, {
    name: input.name,
    batchSize: input.batchSize,
    scheduledAt,
    status: scheduledAt ? "SCHEDULED" : undefined,
    nextRunAt: scheduledAt,
    isRecurring: input.isRecurring,
    recurrenceInterval: input.recurrenceInterval,
    recurrenceEndAt: input.recurrenceEndAt ? new Date(input.recurrenceEndAt) : undefined,
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

function computeNextRunAt(from: Date, interval: RecurrenceInterval): Date {
  const next = new Date(from);
  if (interval === "DAILY") next.setUTCDate(next.getUTCDate() + 1);
  else if (interval === "WEEKLY") next.setUTCDate(next.getUTCDate() + 7);
  else next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

/**
 * Splits the contact group into batches and hands each one to the same
 * sendMessage() the direct-send API uses — reusing its transactional
 * correctness (wallet reservation, fraud checks, outbox event) verbatim
 * rather than duplicating it. Content is uniform across every recipient in
 * this schema (MessageRecipient has no per-row content field) — no
 * per-contact template merge fields, a documented simplification.
 *
 * Shared by the manual "send now" path (sendCampaign, below) and the
 * scheduled/recurring poller (processDueCampaigns) — callers are
 * responsible for their own status precondition check before calling this;
 * it only knows how to actually execute a send and finalize afterward.
 */
async function executeCampaignSend(actor: ActorContext, campaign: Campaign) {
  if (!campaign.templateId) {
    throw AppError.internal("Campaign is missing its template");
  }

  const template = await templateRepository.findById(campaign.templateId);
  if (!template) throw AppError.notFound("Template not found");
  const content = template.content;

  const members = await contactRepository.listGroupMembers(campaign.contactGroupId!);
  const phoneNumbers = members.filter((m) => m.contact.isSubscribed).map((m) => m.contact.phoneRaw);

  if (phoneNumbers.length === 0) {
    throw AppError.conflict("This contact group has no subscribed contacts to send to");
  }

  await campaignRepository.update(campaign.id, { status: "SENDING", totalRecipients: phoneNumbers.length });

  // Batch numbers must keep incrementing across occurrences of a recurring
  // campaign — CampaignBatch has @@unique([campaignId, batchNumber]), so
  // restarting at 1 on a second occurrence would collide with the first.
  let batchNumber = await campaignRepository.countBatches(campaign.id);
  const batches = chunk(phoneNumbers, campaign.batchSize);
  for (const batch of batches) {
    batchNumber++;
    const result = await sendMessage(actor, campaign.organizationId, campaign.environment, {
      senderIdId: campaign.senderIdId,
      recipients: batch,
      content,
      clientReference: `campaign:${campaign.id}:batch:${batchNumber}`,
    });

    await prisma.message.update({ where: { id: result.message!.id }, data: { type: "CAMPAIGN", campaign: { connect: { id: campaign.id } } } });
    await campaignRepository.createBatch({ campaignId: campaign.id, batchNumber, messageId: result.message!.id });
  }

  const now = new Date();
  const stillRecurring = campaign.isRecurring && campaign.recurrenceInterval && (!campaign.recurrenceEndAt || campaign.recurrenceEndAt > now);
  const updated = stillRecurring
    ? await campaignRepository.update(campaign.id, { status: "SCHEDULED", nextRunAt: computeNextRunAt(now, campaign.recurrenceInterval!) })
    : await campaignRepository.update(campaign.id, { status: "COMPLETED", nextRunAt: null });

  await recordAuditEvent({
    actor,
    action: "campaign.send",
    resourceType: "Campaign",
    resourceId: campaign.id,
    organizationId: campaign.organizationId,
    metadata: { totalRecipients: phoneNumbers.length, batches: batches.length, recurring: Boolean(stillRecurring) },
  });

  return updated;
}

export async function sendCampaign(actor: ActorContext, id: string) {
  await assertPermission(actor, PermissionCode.CAMPAIGN_SEND);

  const campaign = await campaignRepository.findById(id);
  if (!campaign) throw AppError.notFound();
  assertOrganizationAccess(actor, campaign.organizationId);

  if (campaign.status !== "DRAFT") {
    throw AppError.conflict("Only a draft campaign can be sent");
  }

  await executeCampaignSend(actor, campaign);
  return campaignRepository.findById(id);
}

/**
 * Runs on a schedule (see workers/scheduled-campaigns-worker.ts), the exact
 * same shape as processDueScheduledMessages in modules/messaging/service.ts.
 * Uses SYSTEM_ACTOR since nothing about this is a user-initiated request —
 * assertOrganizationAccess/hasPermission both bypass for it (see
 * modules/auth/services/authorization-service.ts).
 */
export async function processDueCampaigns(limit = 50): Promise<{ processed: number }> {
  const due = await campaignRepository.listDue(limit);

  let processed = 0;
  for (const campaign of due) {
    await executeCampaignSend(SYSTEM_ACTOR, campaign);
    processed++;
  }
  return { processed };
}

export async function cancelCampaign(actor: ActorContext, id: string) {
  await assertPermission(actor, PermissionCode.CAMPAIGN_CANCEL);

  const campaign = await campaignRepository.findById(id);
  if (!campaign) throw AppError.notFound();
  assertOrganizationAccess(actor, campaign.organizationId);

  if (!["DRAFT", "SCHEDULED"].includes(campaign.status)) {
    throw AppError.conflict("Only a draft or scheduled campaign can be cancelled");
  }

  const updated = await campaignRepository.update(id, { status: "CANCELLED" });
  await recordAuditEvent({ actor, action: "campaign.cancel", resourceType: "Campaign", resourceId: id, organizationId: campaign.organizationId });
  return updated;
}
