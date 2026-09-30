import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { revokeUserSessionForAdmin } from "@/modules/auth/services/auth-service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; sessionId: string }> };

export const DELETE = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id, sessionId } = await params;
  const actor = await getSessionActorContext(request);
  await revokeUserSessionForAdmin(actor, id, sessionId);
  return ok({ revoked: true }, requestId);
});
