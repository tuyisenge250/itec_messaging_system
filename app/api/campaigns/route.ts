import { withRoute } from "@/shared/http/route-handler";
import { ok, created } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { createCampaignSchema } from "@/modules/campaigns/validation";
import { createCampaign, listCampaigns } from "@/modules/campaigns/service";
import { getActorContext } from "@/modules/auth/services/request-context-service";
import { resolveEnvironment } from "@/shared/http/environment";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

export const GET = withRoute(async (request, { requestId }) => {
  const actor = await getActorContext(request);
  if (!actor.organizationId) throw AppError.validation("No organization context could be resolved for this request");
  const campaigns = await listCampaigns(actor, actor.organizationId);
  return ok({ campaigns }, requestId);
});

export const POST = withRoute(async (request, { requestId }) => {
  const actor = await getActorContext(request);
  if (!actor.organizationId) throw AppError.validation("No organization context could be resolved for this request");
  const body = await parseJsonBody(request, createCampaignSchema);
  const environment = resolveEnvironment(actor, request);
  const campaign = await createCampaign(actor, actor.organizationId, environment, body);
  return created(campaign, requestId);
});
