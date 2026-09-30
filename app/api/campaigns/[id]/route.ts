import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { getCampaign, updateCampaign } from "@/modules/campaigns/service";
import { getActorContext } from "@/modules/auth/services/request-context-service";
import { z } from "zod";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  batchSize: z.number().int().min(1).max(5000).optional(),
  scheduledAt: z.string().datetime().optional(),
  isRecurring: z.boolean().optional(),
  recurrenceInterval: z.enum(["DAILY", "WEEKLY", "MONTHLY"]).optional(),
  recurrenceEndAt: z.string().datetime().optional(),
});

export const GET = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getActorContext(request);
  const campaign = await getCampaign(actor, id);
  return ok(campaign, requestId);
});

export const PATCH = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getActorContext(request);
  const body = await parseJsonBody(request, updateSchema);
  const campaign = await updateCampaign(actor, id, body);
  return ok(campaign, requestId);
});
