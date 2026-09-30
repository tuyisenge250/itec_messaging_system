import { prisma } from "@/infrastructure/database/prisma";
import { apiKeyRepository } from "./repository";
import { generateRandomToken, sha256Hex, safeCompare } from "@/shared/utils/crypto";
import { assertPermission, assertOrganizationAccess, assertResourceBelongsToOrganization } from "@/modules/auth/services/authorization-service";
import { recordAuditEvent } from "@/modules/audit/service";
import { AppError } from "@/shared/errors/app-error";
import { ErrorCode } from "@/shared/errors/error-codes";
import { PermissionCode, ALL_PERMISSION_CODES } from "@/shared/constants/permissions";
import type { ActorContext } from "@/shared/types/actor-context";
import type { Environment, ApiKey, Prisma } from "@/generated/prisma/client";

const ENV_PREFIX: Record<Environment, string> = {
  SANDBOX: "sk_test",
  PRODUCTION: "sk_live",
};

export interface CreatedApiKey {
  record: ApiKey;
  /** The full secret token — shown to the caller exactly once, never persisted or logged. */
  plaintextToken: string;
}

export async function createApiKey(
  params: {
    organizationId: string;
    environment: Environment;
    name: string;
    scopes: string[];
    createdByUserId: string;
    rotatedFromId?: string;
  },
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<CreatedApiKey> {
  const publicId = generateRandomToken(9);
  const secret = generateRandomToken(24);
  const prefix = ENV_PREFIX[params.environment];
  const plaintextToken = `${prefix}.${publicId}.${secret}`;

  const record = await apiKeyRepository.create(
    {
      organizationId: params.organizationId,
      environment: params.environment,
      name: params.name,
      publicId,
      hashedSecret: sha256Hex(secret),
      displayPrefix: `${prefix}.${publicId.slice(0, 6)}…`,
      scopes: params.scopes,
      createdByUserId: params.createdByUserId,
      rotatedFromId: params.rotatedFromId ?? null,
    },
    tx,
  );

  return { record, plaintextToken };
}

export interface VerifiedApiKey {
  apiKey: ApiKey;
}

/**
 * Verifies a presented API key token end-to-end: shape, public-id lookup,
 * secret hash comparison, revocation/expiry, and — critically — that its
 * environment isn't being smuggled across a sandbox/production boundary via
 * a client-supplied override (callers pass the environment they intend to
 * operate in; a mismatch is a hard failure, not a fallback).
 */
export async function verifyApiKeyToken(token: string, expectedEnvironment?: Environment): Promise<VerifiedApiKey> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw AppError.of(ErrorCode.API_KEY_INVALID, "Invalid API key", 401);
  }
  const [prefix, publicId, secret] = parts;

  const apiKey = await apiKeyRepository.findByPublicId(publicId);
  if (!apiKey) {
    throw AppError.of(ErrorCode.API_KEY_INVALID, "Invalid API key", 401);
  }

  const expectedPrefix = ENV_PREFIX[apiKey.environment];
  if (prefix !== expectedPrefix) {
    throw AppError.of(ErrorCode.API_KEY_INVALID, "Invalid API key", 401);
  }

  if (!safeCompare(sha256Hex(secret), apiKey.hashedSecret)) {
    throw AppError.of(ErrorCode.API_KEY_INVALID, "Invalid API key", 401);
  }

  if (apiKey.status !== "ACTIVE") {
    throw AppError.of(ErrorCode.API_KEY_REVOKED, "This API key has been revoked", 401);
  }

  if (apiKey.expiresAt && apiKey.expiresAt.getTime() < Date.now()) {
    throw AppError.of(ErrorCode.API_KEY_REVOKED, "This API key has expired", 401);
  }

  if (expectedEnvironment && apiKey.environment !== expectedEnvironment) {
    throw AppError.of(
      ErrorCode.API_KEY_ENVIRONMENT_MISMATCH,
      `This is a ${apiKey.environment.toLowerCase()} API key and cannot be used here`,
      403,
    );
  }

  // Best-effort; failure to update lastUsedAt must never fail the request.
  apiKeyRepository.touchLastUsed(apiKey.id).catch(() => undefined);

  return { apiKey };
}

async function revokeApiKeyInternal(organizationId: string, apiKeyId: string): Promise<void> {
  const apiKey = await apiKeyRepository.findById(apiKeyId);
  if (!apiKey || apiKey.organizationId !== organizationId) {
    throw AppError.notFound("API key not found");
  }
  await apiKeyRepository.revoke(apiKeyId);
}

async function rotateApiKeyInternal(organizationId: string, apiKeyId: string, actorUserId: string): Promise<CreatedApiKey> {
  const existing = await apiKeyRepository.findById(apiKeyId);
  if (!existing || existing.organizationId !== organizationId) {
    throw AppError.notFound("API key not found");
  }
  if (existing.status !== "ACTIVE") {
    throw AppError.conflict("Only an active API key can be rotated");
  }

  const created = await createApiKey({
    organizationId,
    environment: existing.environment,
    name: existing.name,
    scopes: existing.scopes,
    createdByUserId: actorUserId,
    rotatedFromId: existing.id,
  });
  await apiKeyRepository.revoke(existing.id);
  return created;
}

// --- Authorized, audited wrappers for the customer-facing management endpoints ---
// (verifyApiKeyToken above stays unauthenticated on purpose — it IS the authentication check.)

export async function createApiKeyForOrganization(
  actor: ActorContext,
  organizationId: string,
  input: { name: string; environment: Environment; scopes: string[] },
): Promise<CreatedApiKey> {
  await assertPermission(actor, PermissionCode.API_KEY_CREATE);
  assertOrganizationAccess(actor, organizationId);
  if (!actor.userId) throw AppError.unauthenticated();

  const invalidScopes = input.scopes.filter((s) => !ALL_PERMISSION_CODES.includes(s as never));
  if (invalidScopes.length > 0) {
    throw AppError.validation(`Unknown scope(s): ${invalidScopes.join(", ")}`);
  }

  const result = await createApiKey({
    organizationId,
    environment: input.environment,
    name: input.name,
    scopes: input.scopes,
    createdByUserId: actor.userId,
  });

  await recordAuditEvent({
    actor,
    action: "api_key.create",
    resourceType: "ApiKey",
    resourceId: result.record.id,
    organizationId,
    metadata: { environment: input.environment, scopes: input.scopes },
  });

  return result;
}

export async function listApiKeysForOrganization(actor: ActorContext, organizationId: string) {
  await assertPermission(actor, PermissionCode.API_KEY_READ);
  assertOrganizationAccess(actor, organizationId);
  return apiKeyRepository.listForOrganization(organizationId);
}

export async function revokeApiKeyForOrganization(actor: ActorContext, organizationId: string, apiKeyId: string) {
  await assertPermission(actor, PermissionCode.API_KEY_REVOKE);
  assertOrganizationAccess(actor, organizationId);

  const existing = await apiKeyRepository.findById(apiKeyId);
  assertResourceBelongsToOrganization(existing?.organizationId, organizationId);

  await revokeApiKeyInternal(organizationId, apiKeyId);
  await recordAuditEvent({ actor, action: "api_key.revoke", resourceType: "ApiKey", resourceId: apiKeyId, organizationId });
}

export async function rotateApiKeyForOrganization(actor: ActorContext, organizationId: string, apiKeyId: string) {
  await assertPermission(actor, PermissionCode.API_KEY_CREATE);
  assertOrganizationAccess(actor, organizationId);
  if (!actor.userId) throw AppError.unauthenticated();

  const existing = await apiKeyRepository.findById(apiKeyId);
  assertResourceBelongsToOrganization(existing?.organizationId, organizationId);

  const result = await rotateApiKeyInternal(organizationId, apiKeyId, actor.userId);
  await recordAuditEvent({ actor, action: "api_key.rotate", resourceType: "ApiKey", resourceId: result.record.id, organizationId });
  return result;
}
