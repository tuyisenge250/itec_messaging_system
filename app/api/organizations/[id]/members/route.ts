import { withRoute } from "@/shared/http/route-handler";
import { ok, created } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { createMemberSchema } from "@/modules/organizations/validation";
import { listMembers, createMember } from "@/modules/organizations/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
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

export const POST = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  const body = await parseJsonBody(request, createMemberSchema);
  const { membership, temporaryPassword } = await createMember(actor, id, body);
  return created({ membership, temporaryPassword }, requestId);
});
