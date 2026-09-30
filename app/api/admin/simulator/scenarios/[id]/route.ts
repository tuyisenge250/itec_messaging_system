import { withRoute } from "@/shared/http/route-handler";
import { ok } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { updateScenarioSchema } from "@/modules/simulator/validation";
import { getScenario, updateScenario, deleteScenario } from "@/modules/simulator/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  const scenario = await getScenario(actor, id);
  return ok(scenario, requestId);
});

export const PATCH = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  const body = await parseJsonBody(request, updateScenarioSchema);
  const scenario = await updateScenario(actor, id, body);
  return ok(scenario, requestId);
});

export const DELETE = withRoute<Ctx>(async (request, { requestId, params }) => {
  const { id } = await params;
  const actor = await getSessionActorContext(request);
  await deleteScenario(actor, id);
  return ok({ deleted: true }, requestId);
});
