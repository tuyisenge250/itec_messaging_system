import { withRoute } from "@/shared/http/route-handler";
import { created } from "@/shared/http/response";
import { rotateApiKeyForOrganization } from "@/modules/api-keys/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  if (!actor.organizationId) throw AppError.validation("No organization context could be resolved for this request");
  const result = await rotateApiKeyForOrganization(actor, actor.organizationId, id);
  const { hashedSecret: _hashedSecret, ...rest } = result.record;
  return created({ ...rest, token: result.plaintextToken }, requestId);
});
