import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseQuery } from "@/shared/validation/parse-request";
import { listOutboxEventsForAdmin } from "@/modules/outbox/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { z } from "zod";

export const runtime = "nodejs";

const querySchema = z.object({
  status: z.enum(["PENDING", "PUBLISHED", "FAILED"]).optional(),
  cursor: z.string().optional(),
});

export const GET = withRoute(async (request, { requestId }) => {
  const actor = await getSessionActorContext(request);
  const query = parseQuery(request, querySchema);
  const events = await listOutboxEventsForAdmin(actor, query.status, query.cursor);
  return ok({ events }, requestId);
});
