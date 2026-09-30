import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { listAuditEventsForOrganization } from "@/modules/audit/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
  const events = await listAuditEventsForOrganization(actor, id, cursor);
  return ok({ events }, requestId);
});
