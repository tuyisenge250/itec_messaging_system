import { withRoute } from "@/shared/http/route-handler";
import { created } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { registerSchema } from "@/modules/auth/validation";
import { registerUser } from "@/modules/auth/services/auth-service";

export const runtime = "nodejs";

export const POST = withRoute(async (request, { requestId }) => {
  const body = await parseJsonBody(request, registerSchema);
  const { user } = await registerUser(body, {
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return created(
    { id: user.id, email: user.email, name: user.name, status: user.status },
    requestId,
  );
});
