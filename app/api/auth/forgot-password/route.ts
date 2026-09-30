import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { forgotPasswordSchema } from "@/modules/auth/validation";
import { requestPasswordReset } from "@/modules/auth/services/auth-service";

export const runtime = "nodejs";

export const POST = withRoute(async (request, { requestId }) => {
  const body = await parseJsonBody(request, forgotPasswordSchema);
  await requestPasswordReset(body.email, {
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  // Always the same response, whether or not the email is registered.
  return ok({ message: "If an account exists for this email, a reset link has been sent." }, requestId);
});
