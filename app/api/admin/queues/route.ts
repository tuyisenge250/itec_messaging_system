import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { getQueueStats } from "@/modules/system/queue-service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";

export const runtime = "nodejs";

export const GET = withRoute(async (request, { requestId }) => {
  const actor = await getSessionActorContext(request);
  const queues = await getQueueStats(actor);
  return ok({ queues }, requestId);
});
