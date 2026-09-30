import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { reviewSenderIdRequestSchema } from "@/modules/sender-ids/validation";
import { reviewSenderIdRequest } from "@/modules/sender-ids/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  const body = await parseJsonBody(request, reviewSenderIdRequestSchema);
  const senderIdRequest = await reviewSenderIdRequest(actor, id, body);
  return ok(senderIdRequest, requestId);
});
