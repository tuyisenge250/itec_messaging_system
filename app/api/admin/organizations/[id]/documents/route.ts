import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { listDocuments } from "@/modules/documents/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { requirePlatformAdmin } from "@/modules/auth/services/authorization-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  requirePlatformAdmin(actor);

  const documents = await listDocuments(actor, id);
  return ok({ documents }, requestId);
});
