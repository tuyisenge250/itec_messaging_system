import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseOptionalJsonBody } from "@/shared/validation/parse-request";
import { reviewDecisionSchema } from "@/modules/organizations/validation";
import { reviewDocument } from "@/modules/documents/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  const body = await parseOptionalJsonBody(request, reviewDecisionSchema);
  const document = await reviewDocument(actor, id, "APPROVED", body.notes);
  return ok(document, requestId);
});
