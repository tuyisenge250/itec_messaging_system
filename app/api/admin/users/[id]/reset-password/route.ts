import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { adminResetPasswordSchema } from "@/modules/auth/validation";
import { adminResetPassword } from "@/modules/auth/services/auth-service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { requirePlatformAdmin, assertPermission } from "@/modules/auth/services/authorization-service";
import { PermissionCode } from "@/shared/constants/permissions";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.ADMIN_USERS_MANAGE);

  const body = await parseJsonBody(request, adminResetPasswordSchema);
  await adminResetPassword(actor, id, body.password);
  return ok({ reset: true }, requestId);
});
