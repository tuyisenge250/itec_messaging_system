import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { updatePricingPlan } from "@/modules/billing/pricing-service";
import { z } from "zod";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  pricePerSegmentMinorUnits: z.number().int().positive().optional(),
  currency: z.string().trim().min(1).max(10).optional(),
  isDefault: z.boolean().optional(),
  active: z.boolean().optional(),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().optional(),
});

export const PATCH = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  const body = await parseJsonBody(request, updateSchema);
  const plan = await updatePricingPlan(actor, id, body);
  return ok(plan, requestId);
});
