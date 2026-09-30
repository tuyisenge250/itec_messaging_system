import { templateRepository } from "./repository";
import { extractTemplateVariables } from "./validation";
import { assertPermission, assertOrganizationAccess, assertResourceBelongsToOrganization } from "@/modules/auth/services/authorization-service";
import { AppError } from "@/shared/errors/app-error";
import { PermissionCode } from "@/shared/constants/permissions";
import type { ActorContext } from "@/shared/types/actor-context";
import type { z } from "zod";
import type { createTemplateSchema, updateTemplateSchema } from "./validation";

export async function createTemplate(actor: ActorContext, organizationId: string, input: z.infer<typeof createTemplateSchema>) {
  await assertPermission(actor, PermissionCode.TEMPLATES_MANAGE);
  assertOrganizationAccess(actor, organizationId);

  return templateRepository.create({
    organization: { connect: { id: organizationId } },
    name: input.name,
    content: input.content,
    category: input.category,
    variables: extractTemplateVariables(input.content),
  });
}

export async function listTemplates(actor: ActorContext, organizationId: string) {
  await assertPermission(actor, PermissionCode.TEMPLATES_MANAGE);
  assertOrganizationAccess(actor, organizationId);
  return templateRepository.list(organizationId);
}

export async function updateTemplate(
  actor: ActorContext,
  organizationId: string,
  templateId: string,
  input: z.infer<typeof updateTemplateSchema>,
) {
  await assertPermission(actor, PermissionCode.TEMPLATES_MANAGE);
  assertOrganizationAccess(actor, organizationId);

  const existing = await templateRepository.findById(templateId);
  assertResourceBelongsToOrganization(existing?.organizationId, organizationId);

  return templateRepository.update(templateId, {
    ...input,
    variables: input.content ? extractTemplateVariables(input.content) : undefined,
  });
}

export async function deleteTemplate(actor: ActorContext, organizationId: string, templateId: string) {
  await assertPermission(actor, PermissionCode.TEMPLATES_MANAGE);
  assertOrganizationAccess(actor, organizationId);

  const existing = await templateRepository.findById(templateId);
  assertResourceBelongsToOrganization(existing?.organizationId, organizationId);
  if (!existing) throw AppError.notFound();

  await templateRepository.delete(templateId);
}
