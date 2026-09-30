import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { listSessionsForUser, getSessionCookie } from "@/modules/auth/services/session-service";
import { AppError } from "@/shared/errors/app-error";

export const runtime = "nodejs";

export const GET = withRoute(async (request, { requestId }) => {
  const actor = await getSessionActorContext(request);
  if (!actor.userId) throw AppError.unauthenticated();

  const currentToken = await getSessionCookie();
  const sessions = await listSessionsForUser(actor.userId, currentToken);
  return ok({ sessions }, requestId);
});
