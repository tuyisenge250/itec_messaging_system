import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseQuery } from "@/shared/validation/parse-request";
import { listAuditEvents } from "@/modules/audit/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { z } from "zod";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const querySchema = z.object({
  cursor: z.string().optional(),
});

export const GET = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  const query = parseQuery(request, querySchema);
  const events = await listAuditEvents(actor, { actorUserId: id, cursor: query.cursor });
  return ok({ events }, requestId);
});
