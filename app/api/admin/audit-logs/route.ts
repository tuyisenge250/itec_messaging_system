import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseQuery } from "@/shared/validation/parse-request";
import { listAuditEvents } from "@/modules/audit/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { z } from "zod";

export const runtime = "nodejs";

const querySchema = z.object({
  organizationId: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  cursor: z.string().optional(),
});

export const GET = withRoute(async (request, { requestId }) => {
  const actor = await getSessionActorContext(request);
  const query = parseQuery(request, querySchema);
  const events = await listAuditEvents(actor, query);
  return ok({ events }, requestId);
});
