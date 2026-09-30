import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { markNotificationRead } from "@/modules/notifications/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  const notification = await markNotificationRead(actor, id);
  return ok(notification, requestId);
});
