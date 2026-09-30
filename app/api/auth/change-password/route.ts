import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { changeOwnPassword } from "@/modules/auth/services/auth-service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { setSessionCookie } from "@/modules/auth/services/session-service";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .regex(/[a-zA-Z]/, "Password must contain a letter")
    .regex(/[0-9]/, "Password must contain a number"),
});

export const POST = withRoute(async (request, { requestId }) => {
  const actor = await getSessionActorContext(request);
  const body = await parseJsonBody(request, bodySchema);

  const result = await changeOwnPassword(actor, body.currentPassword, body.newPassword, {
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });
  await setSessionCookie(result.token, result.expiresAt);

  return ok({ changed: true }, requestId);
});
