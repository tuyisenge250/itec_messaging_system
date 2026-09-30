import { prisma } from "@/infrastructure/database/prisma";
import { senderIdRepository } from "./repository";
import {
  assertCanSubmit,
  assertValidReviewTransition,
  assertCanApprove,
  assertCanReject,
} from "./state-machine";
import {
  assertPermission,
  assertOrganizationAccess,
  requirePlatformAdmin,
} from "@/modules/auth/services/authorization-service";
import { recordAuditEvent } from "@/modules/audit/service";
import { AppError } from "@/shared/errors/app-error";
import { PermissionCode } from "@/shared/constants/permissions";
import { Prisma, type SenderIdRequestStatus } from "@/generated/prisma/client";
import type { ActorContext } from "@/shared/types/actor-context";
import type { z } from "zod";
import type {
  createSenderIdRequestSchema,
  updateSenderIdRequestSchema,
  reviewSenderIdRequestSchema,
} from "./validation";

export async function createSenderIdRequest(
  actor: ActorContext,
  organizationId: string,
  input: z.infer<typeof createSenderIdRequestSchema>,
) {
  await assertPermission(actor, PermissionCode.SENDER_ID_REQUEST);
  assertOrganizationAccess(actor, organizationId);
  if (!actor.userId) throw AppError.unauthenticated();

  const request = await senderIdRepository.create({
    organization: { connect: { id: organizationId } },
    environment: input.environment,
    requestedValue: input.requestedValue.toUpperCase(),
    purpose: input.purpose,
    sampleMessageContent: input.sampleMessageContent,
    createdBy: { connect: { id: actor.userId } },
  });

  await recordAuditEvent({
    actor,
    action: "sender_id.request_created",
    resourceType: "SenderIdRequest",
    resourceId: request.id,
    organizationId,
  });

  return request;
}

export async function getSenderIdRequest(actor: ActorContext, id: string) {
  await assertPermission(actor, PermissionCode.SENDER_ID_READ);
  const request = await senderIdRepository.findById(id);
  if (!request) throw AppError.notFound();
  assertOrganizationAccess(actor, request.organizationId);
  return request;
}

export async function listSenderIdRequests(actor: ActorContext, organizationId: string, status?: SenderIdRequestStatus) {
  await assertPermission(actor, PermissionCode.SENDER_ID_READ);
  assertOrganizationAccess(actor, organizationId);
  return senderIdRepository.listForOrganization(organizationId, status);
}

export async function updateSenderIdRequest(
  actor: ActorContext,
  id: string,
  input: z.infer<typeof updateSenderIdRequestSchema>,
) {
  await assertPermission(actor, PermissionCode.SENDER_ID_UPDATE);
  const request = await senderIdRepository.findById(id);
  if (!request) throw AppError.notFound();
  assertOrganizationAccess(actor, request.organizationId);

  if (!["DRAFT", "DOCUMENTS_REQUIRED"].includes(request.status)) {
    throw AppError.conflict("This sender ID request can no longer be edited");
  }

  return senderIdRepository.update(id, input);
}

export async function submitSenderIdRequest(actor: ActorContext, id: string) {
  await assertPermission(actor, PermissionCode.SENDER_ID_SUBMIT);
  const request = await senderIdRepository.findById(id);
  if (!request) throw AppError.notFound();
  assertOrganizationAccess(actor, request.organizationId);
  assertCanSubmit(request.status);

  const updated = await transitionAndRecord(request.id, request.status, "SUBMITTED", actor, {
    submittedAt: new Date(),
  });
  return updated;
}

async function transitionAndRecord(
  requestId: string,
  from: SenderIdRequestStatus,
  to: SenderIdRequestStatus,
  actor: ActorContext,
  extra: Record<string, unknown> = {},
  note?: string,
) {
  const [updated] = await prisma.$transaction([
    // `extra` must only ever contain real SenderIdRequest columns — the
    // free-text review note is a separate SenderIdRequestStatusHistory field
    // (`note` below), never a SenderIdRequest column itself.
    prisma.senderIdRequest.update({ where: { id: requestId }, data: { status: to, ...extra } }),
    prisma.senderIdRequestStatusHistory.create({
      data: { senderIdRequestId: requestId, fromStatus: from, toStatus: to, actorUserId: actor.userId, note: note ?? null },
    }),
  ]);

  await recordAuditEvent({
    actor,
    action: `sender_id.status_changed`,
    resourceType: "SenderIdRequest",
    resourceId: requestId,
    metadata: { from, to },
  });

  return updated;
}

export async function reviewSenderIdRequest(
  actor: ActorContext,
  id: string,
  input: z.infer<typeof reviewSenderIdRequestSchema>,
) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.SENDER_ID_REVIEW);

  const request = await senderIdRepository.findById(id);
  if (!request) throw AppError.notFound();
  assertValidReviewTransition(request.status, input.toStatus);

  const extra: Record<string, unknown> = { internalReviewerUserId: actor.userId };
  if (input.notes) extra.internalReviewNotes = input.notes;
  if (input.ruraReferenceNumber) extra.ruraReferenceNumber = input.ruraReferenceNumber;
  if (input.toStatus === "RURA_SUBMITTED") extra.ruraSubmittedAt = new Date();
  if (input.toStatus === "RURA_INFORMATION_REQUESTED") extra.ruraInformationRequestNotes = input.notes ?? null;
  if (input.toStatus === "RURA_APPROVED") extra.ruraApprovedAt = new Date();
  if (input.toStatus === "RURA_REJECTED") extra.ruraRejectedAt = new Date();

  return transitionAndRecord(id, request.status, input.toStatus, actor, extra, input.notes);
}

export async function rejectSenderIdRequest(actor: ActorContext, id: string, notes?: string) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.SENDER_ID_REJECT);

  const request = await senderIdRepository.findById(id);
  if (!request) throw AppError.notFound();
  assertCanReject(request.status);

  return transitionAndRecord(id, request.status, "REJECTED", actor, { completedAt: new Date() }, notes);
}

/**
 * Final approval: creates the live SenderId resource and links it back via
 * approvedSenderIdId — this is where the workflow object (SenderIdRequest)
 * hands off to the operational resource (SenderId) that messages actually
 * reference. Note SenderId uniqueness is scoped per-organization in this
 * schema (@@unique([organizationId, value, environment])), not globally, so
 * two different organizations may hold the same sender ID value — that
 * mirrors this schema's design and isn't something this service enforces.
 */
export async function approveSenderIdRequest(actor: ActorContext, id: string, mnoNotes?: string) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.SENDER_ID_APPROVE);

  const request = await senderIdRepository.findById(id);
  if (!request) throw AppError.notFound();
  assertCanApprove(request.status);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const senderId = await tx.senderId.create({
        data: {
          organization: { connect: { id: request.organizationId } },
          environment: request.environment,
          value: request.requestedValue,
          status: "ACTIVE",
          activatedAt: new Date(),
        },
      });

      const updatedRequest = await tx.senderIdRequest.update({
        where: { id },
        data: {
          status: "APPROVED",
          approvedSenderId: { connect: { id: senderId.id } },
          mnoWhitelistCompletedAt: new Date(),
          completedAt: new Date(),
        },
      });

      await tx.senderIdRequestStatusHistory.create({
        data: {
          senderIdRequestId: id,
          fromStatus: request.status,
          toStatus: "APPROVED",
          actorUserId: actor.userId,
          note: mnoNotes ?? null,
        },
      });

      return { senderId, request: updatedRequest };
    });

    await recordAuditEvent({
      actor,
      action: "sender_id.approved",
      resourceType: "SenderIdRequest",
      resourceId: id,
      organizationId: request.organizationId,
      metadata: { senderIdId: result.senderId.id, value: result.senderId.value },
    });

    return result;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw AppError.conflict("This organization already has an active sender ID with this value in this environment");
    }
    throw error;
  }
}

export async function listSenderIds(actor: ActorContext, organizationId: string) {
  await assertPermission(actor, PermissionCode.SENDER_ID_READ);
  assertOrganizationAccess(actor, organizationId);
  return senderIdRepository.listSenderIdsForOrganization(organizationId);
}

/**
 * Shared by suspendSenderId/activateSenderId below. organizationId is
 * deliberately derived from the loaded SenderId row rather than taken as a
 * caller-supplied param — a mismatched (organizationId, senderId) pair would
 * otherwise silently act on a different organization's sender ID, since
 * assertOrganizationAccess is a no-op for the platform admin actor this is
 * gated to anyway.
 */
async function setSenderIdStatus(actor: ActorContext, senderId: string, status: "ACTIVE" | "SUSPENDED") {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.SENDER_ID_MANAGE_LIFECYCLE);

  const existing = await senderIdRepository.findSenderIdById(senderId);
  if (!existing) throw AppError.notFound();
  assertOrganizationAccess(actor, existing.organizationId);

  const updated = await senderIdRepository.updateSenderIdStatus(senderId, status);

  await recordAuditEvent({
    actor,
    action: status === "SUSPENDED" ? "sender_id.suspended" : "sender_id.activated",
    resourceType: "SenderId",
    resourceId: senderId,
    organizationId: existing.organizationId,
    metadata: { value: existing.value, previousStatus: existing.status },
  });

  return updated;
}

export async function suspendSenderId(actor: ActorContext, senderId: string) {
  return setSenderIdStatus(actor, senderId, "SUSPENDED");
}

export async function activateSenderId(actor: ActorContext, senderId: string) {
  return setSenderIdStatus(actor, senderId, "ACTIVE");
}

export async function listSenderIdRequestsForAdmin(actor: ActorContext, status?: SenderIdRequestStatus, cursor?: string) {
  requirePlatformAdmin(actor);
  return senderIdRepository.listForAdmin(status, cursor);
}
