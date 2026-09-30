import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { removeJob } from "@/modules/system/queue-service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ name: string; id: string }> };

export const DELETE = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { name, id } = await params;
  const actor = await getSessionActorContext(request);
  await removeJob(actor, name, id);
  return ok({ removed: true }, requestId);
});
