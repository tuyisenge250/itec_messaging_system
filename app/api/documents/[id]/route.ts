import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { getDocument, deleteDocument } from "@/modules/documents/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  const document = await getDocument(actor, id);
  return ok(document, requestId);
});

export const DELETE = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  const document = await getDocument(actor, id);
  await deleteDocument(actor, document.organizationId, id);
  return ok({ deleted: true }, requestId);
});
