import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { listSenderIds } from "@/modules/sender-ids/service";
import { getActorContext } from "@/modules/auth/services/request-context-service";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

// Live, operational SenderId resources (status ACTIVE/SUSPENDED/...) — distinct from
// GET /api/sender-ids, which lists the SenderIdRequest workflow objects. Used wherever a
// caller needs to pick a sender ID to actually send with (e.g. the "send message" form).
export const GET = withRoute(async (request, { requestId }) => {
  const actor = await getActorContext(request);
  if (!actor.organizationId) throw AppError.validation("No organization context could be resolved for this request");
  const senderIds = await listSenderIds(actor, actor.organizationId);
  return ok({ senderIds }, requestId);
});
