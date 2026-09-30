import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseQuery } from "@/shared/validation/parse-request";
import { listPaymentIntents } from "@/modules/billing/payment-service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { requirePlatformAdmin } from "@/modules/auth/services/authorization-service";
import { z } from "zod";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const querySchema = z.object({
  environment: z.enum(["SANDBOX", "PRODUCTION"]).optional(),
});

export const GET = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  requirePlatformAdmin(actor);

  const query = parseQuery(request, querySchema);
  const paymentIntents = await listPaymentIntents(actor, id, query.environment);
  return ok({ paymentIntents }, requestId);
});
