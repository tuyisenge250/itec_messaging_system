import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { resetPasswordSchema } from "@/modules/auth/validation";
import { resetPassword } from "@/modules/auth/services/auth-service";

export const runtime = "nodejs";

export const POST = withRoute(async (request, { requestId }) => {
  const body = await parseJsonBody(request, resetPasswordSchema);
  await resetPassword(body.token, body.password, {
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return ok({ message: "Password has been reset. Please sign in again." }, requestId);
});
