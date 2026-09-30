import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseQuery } from "@/shared/validation/parse-request";
import { listSenderIdRequestsForAdmin } from "@/modules/sender-ids/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { z } from "zod";

export const runtime = "nodejs";

const querySchema = z.object({
  status: z
    .enum([
      "DRAFT",
      "SUBMITTED",
      "DOCUMENTS_REQUIRED",
      "UNDER_REVIEW",
      "RURA_SUBMITTED",
      "RURA_INFORMATION_REQUESTED",
      "RURA_APPROVED",
      "RURA_REJECTED",
      "MNO_WHITELISTING",
      "APPROVED",
      "REJECTED",
      "CANCELLED",
    ])
    .optional(),
  cursor: z.string().optional(),
});

export const GET = withRoute(async (request, { requestId }) => {
  const actor = await getSessionActorContext(request);
  const query = parseQuery(request, querySchema);
  const requests = await listSenderIdRequestsForAdmin(actor, query.status, query.cursor);
  return ok({ senderIdRequests: requests }, requestId);
});
