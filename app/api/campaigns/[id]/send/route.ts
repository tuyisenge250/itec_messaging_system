import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { sendCampaign } from "@/modules/campaigns/service";
import { getActorContext } from "@/modules/auth/services/request-context-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getActorContext(request);
  const campaign = await sendCampaign(actor, id);
  return ok(campaign, requestId);
});
