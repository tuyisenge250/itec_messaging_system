import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { revokeSessionById } from "@/modules/auth/services/session-service";
import { recordAuditEvent } from "@/modules/audit/service";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  if (!actor.userId) throw AppError.unauthenticated();

  await revokeSessionById(actor.userId, id);
  await recordAuditEvent({ actor, action: "auth.session_revoked", resourceType: "Session", resourceId: id });
  return ok({ revoked: true }, requestId);
});
