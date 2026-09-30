import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { listMembers } from "@/modules/organizations/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { requirePlatformAdmin } from "@/modules/auth/services/authorization-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  requirePlatformAdmin(actor);

  const members = await listMembers(actor, id);
  return ok(
    {
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        email: m.user.email,
        name: m.user.name,
        roleId: m.roleId,
        role: m.role.name,
        status: m.status,
        joinedAt: m.joinedAt,
      })),
    },
    requestId,
  );
});
