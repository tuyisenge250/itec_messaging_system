import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { listFraudRules } from "@/modules/fraud/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";

export const runtime = "nodejs";

export const GET = withRoute(async (request, { requestId }) => {
  const actor = await getSessionActorContext(request);
  const rules = await listFraudRules(actor);
  return ok({ rules }, requestId);
});
