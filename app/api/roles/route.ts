import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { authRepository } from "@/modules/auth/repository";

export const runtime = "nodejs";

// Read-only reference data (what each role can do) — not sensitive, available to any
// authenticated user so the "Roles & Permissions" settings page can explain the RBAC
// model without needing platform-admin access.
export const GET = withRoute(async (request, { requestId }) => {
  await getSessionActorContext(request);
  const roles = await authRepository.listRolesWithPermissions();
  return ok(
    {
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        permissions: r.permissions.map((rp) => rp.permission.code),
      })),
    },
    requestId,
  );
});
