import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseQuery } from "@/shared/validation/parse-request";
import { listOrganizationsForAdmin } from "@/modules/organizations/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { z } from "zod";

export const runtime = "nodejs";

const querySchema = z.object({
  status: z.enum(["PENDING", "UNDER_REVIEW", "VERIFIED", "REJECTED", "SUSPENDED", "ACTIVE"]).optional(),
  cursor: z.string().optional(),
});

export const GET = withRoute(async (request, { requestId }) => {
  const actor = await getSessionActorContext(request);
  const query = parseQuery(request, querySchema);
  const organizations = await listOrganizationsForAdmin(actor, query.status, query.cursor);
  return ok({ organizations }, requestId);
});
