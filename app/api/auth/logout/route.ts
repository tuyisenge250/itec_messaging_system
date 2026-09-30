import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { logout } from "@/modules/auth/services/auth-service";
import { getSessionCookie, clearSessionCookie, validateSessionToken } from "@/modules/auth/services/session-service";

export const runtime = "nodejs";

export const POST = withRoute(async (request, { requestId }) => {
  const token = await getSessionCookie();
  if (token) {
    const session = await validateSessionToken(token);
    await logout(
      {
        actorType: "USER",
        userId: session?.user.id,
        requestId,
        ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
        userAgent: request.headers.get("user-agent") ?? undefined,
      },
      token,
    );
    await clearSessionCookie();
  }

  return ok({ loggedOut: true }, requestId);
});
