import { withRoute } from "@/shared/http/route-handler";
import { ok, created } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { createSenderIdRequestSchema } from "@/modules/sender-ids/validation";
import { createSenderIdRequest, listSenderIdRequests } from "@/modules/sender-ids/service";
import { getActorContext } from "@/modules/auth/services/request-context-service";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

function requireOrg(organizationId: string | undefined): string {
  if (!organizationId) {
    throw AppError.validation("No organization context could be resolved for this request");
  }
  return organizationId;
}

export const GET = withRoute(async (request, { requestId }) => {
  const actor = await getActorContext(request);
  const organizationId = requireOrg(actor.organizationId);
  const requests = await listSenderIdRequests(actor, organizationId);
  return ok({ senderIdRequests: requests }, requestId);
});

export const POST = withRoute(async (request, { requestId }) => {
  const actor = await getActorContext(request);
  const organizationId = requireOrg(actor.organizationId);
  const body = await parseJsonBody(request, createSenderIdRequestSchema);
  const senderIdRequest = await createSenderIdRequest(actor, organizationId, body);
  return created(senderIdRequest, requestId);
});
