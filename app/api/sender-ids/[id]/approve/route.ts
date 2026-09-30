import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseOptionalJsonBody } from "@/shared/validation/parse-request";
import { approveSenderIdRequestSchema } from "@/modules/sender-ids/validation";
import { approveSenderIdRequest } from "@/modules/sender-ids/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  const body = await parseOptionalJsonBody(request, approveSenderIdRequestSchema);
  const result = await approveSenderIdRequest(actor, id, body.mnoNotes);
  return ok(result, requestId);
});
