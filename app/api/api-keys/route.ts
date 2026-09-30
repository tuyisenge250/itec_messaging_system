import { withRoute } from "@/shared/http/route-handler";
import { ok, created } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { createApiKeySchema } from "@/modules/api-keys/validation";
import { createApiKeyForOrganization, listApiKeysForOrganization } from "@/modules/api-keys/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

export const GET = withRoute(async (request, { requestId }) => {
  const actor = await getSessionActorContext(request);
  if (!actor.organizationId) throw AppError.validation("No organization context could be resolved for this request");
  const apiKeys = await listApiKeysForOrganization(actor, actor.organizationId);
  // Never return hashedSecret, even to the owning org.
  const sanitized = apiKeys.map(({ hashedSecret: _hashedSecret, ...rest }) => rest);
  return ok({ apiKeys: sanitized }, requestId);
});

export const POST = withRoute(async (request, { requestId }) => {
  const actor = await getSessionActorContext(request);
  if (!actor.organizationId) throw AppError.validation("No organization context could be resolved for this request");
  const body = await parseJsonBody(request, createApiKeySchema);
  const result = await createApiKeyForOrganization(actor, actor.organizationId, body);
  const { hashedSecret: _hashedSecret, ...rest } = result.record;
  return created({ ...rest, token: result.plaintextToken }, requestId);
});
