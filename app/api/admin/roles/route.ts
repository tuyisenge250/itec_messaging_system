import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { listGlobalRolesForAdmin } from "@/modules/roles/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";

export const runtime = "nodejs";

export const GET = withRoute(async (request, { requestId }) => {
  const actor = await getSessionActorContext(request);
  const roles = await listGlobalRolesForAdmin(actor);
  return ok({ roles }, requestId);
});
