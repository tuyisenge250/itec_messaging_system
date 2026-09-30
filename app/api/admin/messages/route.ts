import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseQuery } from "@/shared/validation/parse-request";
import { listMessagesQuerySchema } from "@/modules/messaging/validation";
import { listMessagesForAdmin } from "@/modules/messaging/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";

export const runtime = "nodejs";

export const GET = withRoute(async (request, { requestId }) => {
  const actor = await getSessionActorContext(request);
  const query = parseQuery(request, listMessagesQuerySchema);
  const messages = await listMessagesForAdmin(actor, query.status, query.cursor);
  return ok({ messages }, requestId);
});
