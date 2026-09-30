import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { listSandboxTestNumbers } from "@/modules/sandbox/service";
import { getActorContext } from "@/modules/auth/services/request-context-service";

export const runtime = "nodejs";

export const GET = withRoute(async (request, { requestId }) => {
  const actor = await getActorContext(request);
  const data = await listSandboxTestNumbers(actor);
  return ok(data, requestId);
});
