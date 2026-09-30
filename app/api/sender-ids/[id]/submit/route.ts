import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { submitSenderIdRequest } from "@/modules/sender-ids/service";
import { getActorContext } from "@/modules/auth/services/request-context-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getActorContext(request);
  const senderIdRequest = await submitSenderIdRequest(actor, id);
  return ok(senderIdRequest, requestId);
});
