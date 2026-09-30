import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { listWebhooks } from "@/modules/webhooks/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { requirePlatformAdmin } from "@/modules/auth/services/authorization-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  requirePlatformAdmin(actor);

  const webhooks = await listWebhooks(actor, id);
  // Never return the encrypted signing secret, even to a platform admin.
  const sanitized = webhooks.map(({ secretEncrypted: _secretEncrypted, ...rest }) => rest);
  return ok({ webhooks: sanitized }, requestId);
});
