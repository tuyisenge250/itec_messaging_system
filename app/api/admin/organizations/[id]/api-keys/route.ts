import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { listApiKeysForOrganization } from "@/modules/api-keys/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { requirePlatformAdmin } from "@/modules/auth/services/authorization-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  requirePlatformAdmin(actor);

  const apiKeys = await listApiKeysForOrganization(actor, id);
  // Never return hashedSecret, even to a platform admin.
  const sanitized = apiKeys.map(({ hashedSecret: _hashedSecret, ...rest }) => rest);
  return ok({ apiKeys: sanitized }, requestId);
});
