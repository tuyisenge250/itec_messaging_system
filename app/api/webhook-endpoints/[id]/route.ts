import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { updateWebhookSchema } from "@/modules/webhooks/validation";
import { updateWebhook, deleteWebhook } from "@/modules/webhooks/service";
import { getActorContext } from "@/modules/auth/services/request-context-service";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getActorContext(request);
  if (!actor.organizationId) throw AppError.validation("No organization context could be resolved for this request");
  const body = await parseJsonBody(request, updateWebhookSchema);
  const webhook = await updateWebhook(actor, actor.organizationId, id, body);
  return ok(webhook, requestId);
});

export const DELETE = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getActorContext(request);
  if (!actor.organizationId) throw AppError.validation("No organization context could be resolved for this request");
  await deleteWebhook(actor, actor.organizationId, id);
  return ok({ deleted: true }, requestId);
});
