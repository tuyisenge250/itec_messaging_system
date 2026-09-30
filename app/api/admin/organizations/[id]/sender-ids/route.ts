import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { listSenderIdRequests, listSenderIds } from "@/modules/sender-ids/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { requirePlatformAdmin } from "@/modules/auth/services/authorization-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  requirePlatformAdmin(actor);

  const [requests, active] = await Promise.all([listSenderIdRequests(actor, id), listSenderIds(actor, id)]);
  return ok({ requests, active }, requestId);
});
