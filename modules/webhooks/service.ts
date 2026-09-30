import { webhookRepository } from "./repository";
import { assertPermission, assertOrganizationAccess, assertResourceBelongsToOrganization } from "@/modules/auth/services/authorization-service";
import { recordAuditEvent } from "@/modules/audit/service";
import { generateRandomToken } from "@/shared/utils/crypto";
import { encryptSecret } from "@/shared/utils/encryption";
import { assertPubliclyRoutableUrl } from "@/shared/utils/url-safety";
import { AppError } from "@/shared/errors/app-error";
import { PermissionCode } from "@/shared/constants/permissions";
import type { ActorContext } from "@/shared/types/actor-context";
import type { z } from "zod";
import type { createWebhookSchema, updateWebhookSchema } from "./validation";

export async function createWebhook(actor: ActorContext, organizationId: string, input: z.infer<typeof createWebhookSchema>) {
  await assertPermission(actor, PermissionCode.WEBHOOK_MANAGE);
  assertOrganizationAccess(actor, organizationId);
  await assertPubliclyRoutableUrl(input.url);

  const secret = generateRandomToken(24);
  const webhook = await webhookRepository.create({
    organization: { connect: { id: organizationId } },
    environment: input.environment,
    url: input.url,
    events: input.events,
    secretEncrypted: encryptSecret(secret),
  });

  await recordAuditEvent({ actor, action: "webhook.create", resourceType: "Webhook", resourceId: webhook.id, organizationId });

  // The signing secret is returned once, at creation — never persisted in plaintext or logged again.
  return { ...webhook, secret };
}

export async function listWebhooks(actor: ActorContext, organizationId: string) {
  await assertPermission(actor, PermissionCode.WEBHOOK_MANAGE);
  assertOrganizationAccess(actor, organizationId);
  return webhookRepository.listForOrganization(organizationId);
}

export async function updateWebhook(
  actor: ActorContext,
  organizationId: string,
  webhookId: string,
  input: z.infer<typeof updateWebhookSchema>,
) {
  await assertPermission(actor, PermissionCode.WEBHOOK_MANAGE);
  assertOrganizationAccess(actor, organizationId);
  if (input.url) await assertPubliclyRoutableUrl(input.url);

  const existing = await webhookRepository.findById(webhookId);
  assertResourceBelongsToOrganization(existing?.organizationId, organizationId);

  const updated = await webhookRepository.update(webhookId, input);
  await recordAuditEvent({ actor, action: "webhook.update", resourceType: "Webhook", resourceId: webhookId, organizationId });
  return updated;
}

export async function listWebhookDeliveries(actor: ActorContext, organizationId: string, webhookId: string) {
  await assertPermission(actor, PermissionCode.WEBHOOK_MANAGE);
  assertOrganizationAccess(actor, organizationId);

  const webhook = await webhookRepository.findById(webhookId);
  assertResourceBelongsToOrganization(webhook?.organizationId, organizationId);

  return webhookRepository.listDeliveries(webhookId);
}

export async function deleteWebhook(actor: ActorContext, organizationId: string, webhookId: string) {
  await assertPermission(actor, PermissionCode.WEBHOOK_MANAGE);
  assertOrganizationAccess(actor, organizationId);

  const existing = await webhookRepository.findById(webhookId);
  assertResourceBelongsToOrganization(existing?.organizationId, organizationId);
  if (!existing) throw AppError.notFound();

  await webhookRepository.delete(webhookId);
  await recordAuditEvent({ actor, action: "webhook.delete", resourceType: "Webhook", resourceId: webhookId, organizationId });
}
