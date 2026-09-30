import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { revokeApiKeyForOrganization } from "@/modules/api-keys/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  if (!actor.organizationId) throw AppError.validation("No organization context could be resolved for this request");
  await revokeApiKeyForOrganization(actor, actor.organizationId, id);
  return ok({ revoked: true }, requestId);
});
