import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { loginSchema } from "@/modules/auth/validation";
import { login } from "@/modules/auth/services/auth-service";
import { setSessionCookie } from "@/modules/auth/services/session-service";

export const runtime = "nodejs";

export const POST = withRoute(async (request, { requestId }) => {
  const body = await parseJsonBody(request, loginSchema);
  const meta = {
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  };

  const result = await login(body, meta);
  await setSessionCookie(result.token, result.expiresAt);

  return ok(
    {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        isPlatformAdmin: result.user.isPlatformAdmin,
      },
    },
    requestId,
  );
});
