import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { updateRoleSchema } from "@/modules/roles/validation";
import { updateRole, deleteRole } from "@/modules/roles/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; roleId: string }> };

export const PATCH = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id, roleId } = await params;
  const actor = await getSessionActorContext(request);
  const body = await parseJsonBody(request, updateRoleSchema);
  const role = await updateRole(actor, id, roleId, body);
  return ok(role, requestId);
});

export const DELETE = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id, roleId } = await params;
  const actor = await getSessionActorContext(request);
  await deleteRole(actor, id, roleId);
  return ok({ deleted: true }, requestId);
});
