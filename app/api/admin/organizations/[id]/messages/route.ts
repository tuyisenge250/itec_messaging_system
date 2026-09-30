import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseQuery } from "@/shared/validation/parse-request";
import { listMessagesQuerySchema } from "@/modules/messaging/validation";
import { listMessages } from "@/modules/messaging/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { requirePlatformAdmin } from "@/modules/auth/services/authorization-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  requirePlatformAdmin(actor);

  const query = parseQuery(request, listMessagesQuerySchema);
  const messages = await listMessages(actor, id, query.status, query.cursor);
  return ok({ messages }, requestId);
});
