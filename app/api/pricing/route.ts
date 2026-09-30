import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { listPricingPlans } from "@/modules/billing/pricing-service";

export const runtime = "nodejs";

export const GET = withRoute(async (_request, { requestId }) => {
  const plans = await listPricingPlans();
  return ok({ plans }, requestId);
});
