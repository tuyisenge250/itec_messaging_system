import { documentRepository } from "./repository";
import { fileStorage } from "@/infrastructure/storage";
import { matchesDeclaredFileSignature } from "@/shared/utils/file-signature";
import {
  assertPermission,
  assertOrganizationAccess,
  assertResourceBelongsToOrganization,
  requirePlatformAdmin,
} from "@/modules/auth/services/authorization-service";
import { recordAuditEvent } from "@/modules/audit/service";
import { AppError } from "@/shared/errors/app-error";
import { ErrorCode } from "@/shared/errors/error-codes";
import { PermissionCode } from "@/shared/constants/permissions";
import { env } from "@/infrastructure/config/env";
import type { ActorContext } from "@/shared/types/actor-context";
import type { DocumentStatus } from "@/generated/prisma/client";

export interface UploadDocumentInput {
  organizationId: string;
  senderIdRequestId?: string;
  documentRequirementCode: string;
  file: { buffer: Buffer; originalFilename: string; mimeType: string };
}

export async function uploadDocument(actor: ActorContext, input: UploadDocumentInput) {
  await assertPermission(actor, PermissionCode.DOCUMENTS_UPLOAD);
  assertOrganizationAccess(actor, input.organizationId);
  if (!actor.userId) throw AppError.unauthenticated();

  const requirement = await documentRepository.findRequirementByCode(input.documentRequirementCode);
  if (!requirement || !requirement.active) {
    throw AppError.validation("Unknown or inactive document type");
  }

  const maxSize = Math.min(requirement.maxSizeBytes, env.MAX_UPLOAD_SIZE_BYTES);
  if (input.file.buffer.byteLength > maxSize) {
    throw AppError.of(ErrorCode.FILE_TOO_LARGE, `File exceeds the maximum size of ${maxSize} bytes`, 400);
  }

  if (requirement.allowedMimeTypes.length > 0 && !requirement.allowedMimeTypes.includes(input.file.mimeType)) {
    throw AppError.of(
      ErrorCode.INVALID_FILE_TYPE,
      `File type ${input.file.mimeType} is not accepted for ${requirement.label}`,
      400,
    );
  }

  if (!matchesDeclaredFileSignature(input.file.mimeType, input.file.buffer)) {
    throw AppError.of(ErrorCode.INVALID_FILE_TYPE, "File content does not match its declared type", 400);
  }

  const saved = await fileStorage.save({
    buffer: input.file.buffer,
    organizationId: input.organizationId,
    originalFilename: input.file.originalFilename,
    mimeType: input.file.mimeType,
  });

  const document = await documentRepository.create({
    organization: { connect: { id: input.organizationId } },
    senderIdRequest: input.senderIdRequestId ? { connect: { id: input.senderIdRequestId } } : undefined,
    documentRequirement: { connect: { id: requirement.id } },
    originalFilename: input.file.originalFilename,
    storageProvider: saved.provider,
    storageKey: saved.storageKey,
    mimeType: input.file.mimeType,
    sizeBytes: input.file.buffer.byteLength,
    uploadedBy: { connect: { id: actor.userId } },
  });

  await recordAuditEvent({
    actor,
    action: "document.upload",
    resourceType: "Document",
    resourceId: document.id,
    organizationId: input.organizationId,
    metadata: { documentRequirementCode: input.documentRequirementCode },
  });

  return document;
}

export async function listDocuments(actor: ActorContext, organizationId: string, senderIdRequestId?: string) {
  await assertPermission(actor, PermissionCode.DOCUMENTS_READ);
  assertOrganizationAccess(actor, organizationId);
  return documentRepository.listForOrganization(organizationId, senderIdRequestId);
}

export async function getDocument(actor: ActorContext, documentId: string) {
  const document = await documentRepository.findById(documentId);
  if (!document) throw AppError.notFound();
  await assertPermission(actor, PermissionCode.DOCUMENTS_READ);
  assertOrganizationAccess(actor, document.organizationId);
  return document;
}

export async function readDocumentContent(actor: ActorContext, documentId: string) {
  const document = await getDocument(actor, documentId);
  const buffer = await fileStorage.read(document.storageKey);
  return { document, buffer };
}

export async function reviewDocument(
  actor: ActorContext,
  documentId: string,
  status: Extract<DocumentStatus, "APPROVED" | "REJECTED">,
  notes?: string,
) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.DOCUMENTS_REVIEW);
  if (!actor.userId) throw AppError.unauthenticated();

  const document = await documentRepository.findById(documentId);
  if (!document) throw AppError.notFound();

  const updated = await documentRepository.review(documentId, status, actor.userId, notes);

  await recordAuditEvent({
    actor,
    action: status === "APPROVED" ? "document.approved" : "document.rejected",
    resourceType: "Document",
    resourceId: documentId,
    organizationId: document.organizationId,
    metadata: notes ? { notes } : undefined,
  });

  return updated;
}

export async function deleteDocument(actor: ActorContext, organizationId: string, documentId: string) {
  await assertPermission(actor, PermissionCode.DOCUMENTS_UPLOAD);
  assertOrganizationAccess(actor, organizationId);

  const document = await documentRepository.findById(documentId);
  assertResourceBelongsToOrganization(document?.organizationId, organizationId);

  if (document!.status !== "PENDING") {
    throw AppError.conflict("Only a pending (not yet reviewed) document can be deleted");
  }

  await fileStorage.delete(document!.storageKey);
  await documentRepository.delete(documentId);

  await recordAuditEvent({
    actor,
    action: "document.delete",
    resourceType: "Document",
    resourceId: documentId,
    organizationId,
  });
}
