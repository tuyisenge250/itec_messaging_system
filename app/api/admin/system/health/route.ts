import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { getSystemHealth } from "@/modules/system/health-service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";

export const runtime = "nodejs";

export const GET = withRoute(async (request, { requestId }) => {
  const actor = await getSessionActorContext(request);
  const health = await getSystemHealth(actor);
  return ok(health, requestId);
});
