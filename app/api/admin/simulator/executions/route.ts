import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { listExecutions } from "@/modules/simulator/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";

export const runtime = "nodejs";

export const GET = withRoute(async (request, { requestId }) => {
  const actor = await getSessionActorContext(request);
  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
  const executions = await listExecutions(actor, cursor);
  return ok({ executions }, requestId);
});
