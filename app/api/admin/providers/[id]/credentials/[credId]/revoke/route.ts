import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { revokeProviderCredential } from "@/modules/providers/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; credId: string }> };

export const POST = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { credId } = await params;
  const actor = await getSessionActorContext(request);
  const credential = await revokeProviderCredential(actor, credId);
  return ok(credential, requestId);
});
