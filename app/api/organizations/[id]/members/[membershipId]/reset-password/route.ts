import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { resetMemberPassword } from "@/modules/organizations/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; membershipId: string }> };

export const POST = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id, membershipId } = await params;
  const actor = await getSessionActorContext(request);
  const { temporaryPassword } = await resetMemberPassword(actor, id, membershipId);
  return ok({ temporaryPassword }, requestId);
});
