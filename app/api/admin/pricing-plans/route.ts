import { withRoute } from "@/shared/http/route-handler";
import { ok, created } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { listPricingPlansForAdmin, createPricingPlan } from "@/modules/billing/pricing-service";
import { z } from "zod";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().trim().min(1).max(150),
  pricePerSegmentMinorUnits: z.number().int().positive(),
  currency: z.string().trim().min(1).max(10).optional(),
  isDefault: z.boolean().optional(),
  active: z.boolean().optional(),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().optional(),
});

// GET: all pricing plans (including inactive) — admin needs the full picture.
export const GET = withRoute(async (request, { requestId }) => {
  const actor = await getSessionActorContext(request);
  const plans = await listPricingPlansForAdmin(actor);
  return ok({ plans }, requestId);
});

export const POST = withRoute(async (request, { requestId }) => {
  const actor = await getSessionActorContext(request);
  const body = await parseJsonBody(request, createSchema);
  const plan = await createPricingPlan(actor, body);
  return created(plan, requestId);
});
