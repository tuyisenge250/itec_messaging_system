import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { updateSetting } from "@/modules/settings/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";
import { z } from "zod";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ key: string }> };

const bodySchema = z.object({
  value: z.string().trim().min(1),
});

export const PATCH = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { key } = await params;
  const actor = await getSessionActorContext(request);
  const body = await parseJsonBody(request, bodySchema);
  const setting = await updateSetting(actor, key, body.value);
  return ok(setting, requestId);
});
