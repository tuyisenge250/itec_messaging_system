import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { getPlatformSummary } from "@/modules/dashboard/service";
import { getActorContext } from "@/modules/auth/services/request-context-service";

export const runtime = "nodejs";

export const GET = withRoute(async (request, { requestId }) => {
  const actor = await getActorContext(request);
  const summary = await getPlatformSummary(actor);
  return ok(summary, requestId);
});
