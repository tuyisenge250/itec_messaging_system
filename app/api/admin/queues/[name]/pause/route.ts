import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { pauseQueue } from "@/modules/system/queue-service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ name: string }> };

export const POST = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { name } = await params;
  const actor = await getSessionActorContext(request);
  await pauseQueue(actor, name);
  return ok({ paused: true }, requestId);
});
