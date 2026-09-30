import { providerConfigRepository } from "./provider-config-repository";
import { credentialRepository } from "./credential-repository";
import { assertPermission, requirePlatformAdmin } from "@/modules/auth/services/authorization-service";
import { recordAuditEvent } from "@/modules/audit/service";
import { encryptSecret } from "@/shared/utils/encryption";
import { AppError } from "@/shared/errors/app-error";
import { PermissionCode } from "@/shared/constants/permissions";
import type { ActorContext } from "@/shared/types/actor-context";
import type { Prisma, ProviderKind, Environment } from "@/generated/prisma/client";

export interface CreateProviderConfigInput {
  providerType: ProviderKind;
  providerCode: string;
  displayName: string;
  environment: Environment;
  isActive?: boolean;
  priority?: number;
  rateLimitPerSecond?: number;
  maxConcurrency?: number;
  timeoutMs?: number;
  retryCount?: number;
  backoffBaseMs?: number;
  circuitBreakerFailureThreshold?: number;
  circuitBreakerCooldownMs?: number;
  settings?: Prisma.InputJsonValue;
}

export type UpdateProviderConfigInput = Partial<Omit<CreateProviderConfigInput, "providerType" | "providerCode" | "environment">>;

export async function listProvidersForAdmin(actor: ActorContext, providerType?: ProviderKind) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.PROVIDER_MANAGE);
  return providerConfigRepository.list(providerType);
}

export async function createProviderConfig(actor: ActorContext, input: CreateProviderConfigInput) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.PROVIDER_MANAGE);

  const existing = await providerConfigRepository.findByUniqueKey(input.providerCode, input.environment, input.providerType);
  if (existing) {
    throw AppError.conflict("A provider config with this code, type, and environment already exists");
  }

  const config = await providerConfigRepository.create(input);

  await recordAuditEvent({
    actor,
    action: "provider.created",
    resourceType: "ProviderConfig",
    resourceId: config.id,
    metadata: { providerCode: input.providerCode, providerType: input.providerType, environment: input.environment },
  });

  return config;
}

export async function updateProviderConfig(actor: ActorContext, id: string, input: UpdateProviderConfigInput) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.PROVIDER_MANAGE);

  const existing = await providerConfigRepository.findById(id);
  if (!existing) throw AppError.notFound();

  const updated = await providerConfigRepository.update(id, input);

  await recordAuditEvent({
    actor,
    action: "provider.updated",
    resourceType: "ProviderConfig",
    resourceId: id,
    metadata: { changed: Object.keys(input) },
  });

  return updated;
}

export async function listProviderCredentials(actor: ActorContext, providerConfigId: string) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.PROVIDER_MANAGE);

  const config = await providerConfigRepository.findById(providerConfigId);
  if (!config) throw AppError.notFound();

  return credentialRepository.listForConfig(providerConfigId);
}

export async function createProviderCredential(
  actor: ActorContext,
  providerConfigId: string,
  input: { key: string; value: string; expiresAt?: string },
) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.PROVIDER_MANAGE);

  const config = await providerConfigRepository.findById(providerConfigId);
  if (!config) throw AppError.notFound();

  const credential = await credentialRepository.create({
    providerConfigId,
    key: input.key,
    encryptedValue: encryptSecret(input.value),
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
  });

  await recordAuditEvent({
    actor,
    action: "provider.credential_created",
    resourceType: "ProviderCredential",
    resourceId: credential.id,
    metadata: { providerConfigId, key: input.key },
  });

  return credential;
}

export async function rotateProviderCredential(actor: ActorContext, credentialId: string, newValue: string) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.PROVIDER_MANAGE);

  const existing = await credentialRepository.findById(credentialId);
  if (!existing) throw AppError.notFound();

  const updated = await credentialRepository.updateValue(credentialId, encryptSecret(newValue));

  await recordAuditEvent({
    actor,
    action: "provider.credential_rotated",
    resourceType: "ProviderCredential",
    resourceId: credentialId,
    metadata: { key: existing.key },
  });

  return updated;
}

export async function revokeProviderCredential(actor: ActorContext, credentialId: string) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.PROVIDER_MANAGE);

  const existing = await credentialRepository.findById(credentialId);
  if (!existing) throw AppError.notFound();

  const updated = await credentialRepository.updateStatus(credentialId, "REVOKED");

  await recordAuditEvent({
    actor,
    action: "provider.credential_revoked",
    resourceType: "ProviderCredential",
    resourceId: credentialId,
    metadata: { key: existing.key },
  });

  return updated;
}
