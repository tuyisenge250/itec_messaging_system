import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { listWebhookDeliveries } from "@/modules/webhooks/service";
import { getActorContext } from "@/modules/auth/services/request-context-service";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getActorContext(request);
  if (!actor.organizationId) throw AppError.validation("No organization context could be resolved for this request");
  const deliveries = await listWebhookDeliveries(actor, actor.organizationId, id);
  return ok({ deliveries }, requestId);
});
