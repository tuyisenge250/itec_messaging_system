import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { updateMemberRoleSchema } from "@/modules/organizations/validation";
import { updateMemberRole, removeMember } from "@/modules/organizations/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; membershipId: string }> };

export const PATCH = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id, membershipId } = await params;
  const actor = await getSessionActorContext(request);
  const body = await parseJsonBody(request, updateMemberRoleSchema);
  const membership = await updateMemberRole(actor, id, membershipId, body.roleId);
  return ok(membership, requestId);
});

export const DELETE = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id, membershipId } = await params;
  const actor = await getSessionActorContext(request);
  const membership = await removeMember(actor, id, membershipId);
  return ok(membership, requestId);
});
