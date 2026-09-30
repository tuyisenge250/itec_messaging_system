import { withRoute } from "@/shared/http/route-handler";
import { ok, created } from "@/shared/http/response";
import { parseQuery, parseJsonBody } from "@/shared/validation/parse-request";
import { listUsersForAdmin, createUserForAdmin } from "@/modules/auth/services/auth-service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { z } from "zod";

export const runtime = "nodejs";

const querySchema = z.object({
  search: z.string().trim().min(1).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  isPlatformAdmin: z.coerce.boolean().optional(),
  cursor: z.string().optional(),
});

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(200).optional(),
  isPlatformAdmin: z.boolean().optional(),
});

export const GET = withRoute(async (request, { requestId }) => {
  const actor = await getSessionActorContext(request);
  const query = parseQuery(request, querySchema);
  const users = await listUsersForAdmin(actor, query);
  return ok(
    {
      users: users.map(({ passwordHash: _passwordHash, ...rest }) => rest),
    },
    requestId,
  );
});

export const POST = withRoute(async (request, { requestId }) => {
  const actor = await getSessionActorContext(request);
  const body = await parseJsonBody(request, createSchema);
  const { user, temporaryPassword } = await createUserForAdmin(actor, body);
  const { passwordHash: _passwordHash, ...rest } = user;
  return created({ user: rest, temporaryPassword }, requestId);
});
