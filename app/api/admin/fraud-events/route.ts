import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseQuery } from "@/shared/validation/parse-request";
import { listFraudEvents } from "@/modules/fraud/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { z } from "zod";

export const runtime = "nodejs";

const querySchema = z.object({
  status: z.enum(["OPEN", "REVIEWING", "RESOLVED", "DISMISSED"]).optional(),
  cursor: z.string().optional(),
  organizationId: z.string().optional(),
});

export const GET = withRoute(async (request, { requestId }) => {
  const actor = await getSessionActorContext(request);
  const query = parseQuery(request, querySchema);
  const events = await listFraudEvents(actor, query.status, query.cursor, query.organizationId);
  return ok({ events }, requestId);
});
