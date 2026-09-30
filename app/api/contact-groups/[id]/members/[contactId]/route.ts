import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { removeContactFromGroup } from "@/modules/contacts/service";
import { getActorContext } from "@/modules/auth/services/request-context-service";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; contactId: string }> };

export const DELETE = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id, contactId } = await params;
  const actor = await getActorContext(request);
  if (!actor.organizationId) throw AppError.validation("No organization context could be resolved for this request");
  await removeContactFromGroup(actor, actor.organizationId, id, contactId);
  return ok({ removed: true }, requestId);
});
