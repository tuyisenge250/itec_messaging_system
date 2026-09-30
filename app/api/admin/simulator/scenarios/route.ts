import { withRoute } from "@/shared/http/route-handler";
import { ok, created } from "@/shared/http/response";
import { parseJsonBody } from "@/shared/validation/parse-request";
import { createScenarioSchema } from "@/modules/simulator/validation";
import { createScenario, listScenarios } from "@/modules/simulator/service";
import { getSessionActorContext } from "@/modules/auth/services/request-context-service";

export const runtime = "nodejs";

export const GET = withRoute(async (request, { requestId }) => {
  const actor = await getSessionActorContext(request);
  const scenarios = await listScenarios(actor);
  return ok({ scenarios }, requestId);
});

export const POST = withRoute(async (request, { requestId }) => {
  const actor = await getSessionActorContext(request);
  const body = await parseJsonBody(request, createScenarioSchema);
  const scenario = await createScenario(actor, body);
  return created(scenario, requestId);
});
