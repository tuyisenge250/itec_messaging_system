import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { documentRepository } from "@/modules/documents/repository";
import { z } from "zod";
import { parseQuery } from "@/shared/validation/parse-request";

export const runtime = "nodejs";

const querySchema = z.object({ appliesTo: z.enum(["ORGANIZATION", "SENDER_ID"]).optional() });

export const GET = withRoute(async (request, { requestId }) => {
  const query = parseQuery(request, querySchema);
  const requirements = await documentRepository.listRequirements(query.appliesTo);
  return ok({ requirements }, requestId);
});
