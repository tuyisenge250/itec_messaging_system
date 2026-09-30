import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { updateSenderIdRequestSchema } from "@/modules/sender-ids/validation";
import { getSenderIdRequest, updateSenderIdRequest } from "@/modules/sender-ids/service";
import { getActorContext } from "@/modules/auth/services/request-context-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getActorContext(request);
  const senderIdRequest = await getSenderIdRequest(actor, id);
  return ok(senderIdRequest, requestId);
});

export const PATCH = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getActorContext(request);
  const body = await parseJsonBody(request, updateSenderIdRequestSchema);
  const senderIdRequest = await updateSenderIdRequest(actor, id, body);
  return ok(senderIdRequest, requestId);
});
