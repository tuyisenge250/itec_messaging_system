import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { listSettingsForAdmin } from "@/modules/settings/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";

export const runtime = "nodejs";

export const GET = withRoute(async (request, { requestId }) => {
  const actor = await getSessionActorContext(request);
  const settings = await listSettingsForAdmin(actor);
  return ok({ settings }, requestId);
});
