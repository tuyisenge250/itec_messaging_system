import { randomUUID } from "node:crypto";
import { env } from "@/infrastructure/config/env";
import { sandboxTestNumber } from "@/shared/utils/sandbox";
import type { SmsProvider, SendSmsRequest, SendSmsResult, DeliveryStatusResult } from "@/modules/providers/sms-provider";
import { matchScenario } from "./scenario-matcher";
import { simulatorRepository } from "./repository";
import { queues } from "@/infrastructure/queues/queues";
import { logger } from "@/infrastructure/logging/logger";

const DEFAULT_DELAY_MS = env.SANDBOX_DEFAULT_DELIVERY_DELAY_MS;

/**
 * Sandbox test number #8 in docs/sandbox.md: "retry then delivered" — the one
 * scenario a static SimulatorScenario row can't express, since a scenario's
 * outcome doesn't vary by attempt count. Kept as simulator-internal code
 * rather than a schema field for a single documented test number; the
 * provider-call retry loop it exercises (TIMEOUT -> requeue) is the real,
 * production-shaped mechanism in modules/messaging/send-processor.ts, not a
 * special code path of its own.
 */
const RETRY_THEN_DELIVERED_NUMBER = sandboxTestNumber("008");
const RETRY_SUCCEED_ON_ATTEMPT = 3;

/**
 * Plays both roles a real SMS provider would: (1) an immediate synchronous
 * accept/reject response from sendSms(), and (2) — because there's no real
 * telecom infrastructure to call us back — it also schedules its own
 * delayed "delivery event" via the sms-delivery queue, which is processed
 * through the exact same webhook-processing pipeline a real provider's
 * webhook would hit (see modules/webhooks and workers/sms-delivery-worker.ts).
 * See docs/architecture.md "Simulator architecture" for why this lives here
 * rather than exposed on the generic SmsProvider interface.
 */
export class SimulatorSmsProvider implements SmsProvider {
  async sendSms(request: SendSmsRequest): Promise<SendSmsResult> {
    const ctx = request.simulatorContext;
    if (!ctx) {
      throw new Error("SimulatorSmsProvider requires simulatorContext");
    }

    if (
      ctx.environment === "SANDBOX" &&
      request.recipient === RETRY_THEN_DELIVERED_NUMBER &&
      ctx.attemptNumber < RETRY_SUCCEED_ON_ATTEMPT
    ) {
      const execution = await simulatorRepository.createExecution({
        recipient: { connect: { id: ctx.recipientId } },
        matchedTriggerType: "PHONE_NUMBER",
        initialStatus: "TIMEOUT",
        delayMsApplied: 0,
        errorMessage: `Simulated: provider call timed out (attempt ${ctx.attemptNumber}/${RETRY_SUCCEED_ON_ATTEMPT - 1})`,
      });
      return {
        status: "TIMEOUT",
        errorMessage: `Simulated: provider call timed out (attempt ${ctx.attemptNumber}/${RETRY_SUCCEED_ON_ATTEMPT - 1})`,
        raw: { simulated: true, retryScenario: true, attemptNumber: ctx.attemptNumber, executionId: execution.id },
      };
    }

    const scenario = await matchScenario({
      environment: ctx.environment,
      organizationId: ctx.organizationId,
      senderIdValue: request.senderId,
      phoneNumber: request.recipient,
      recipientId: ctx.recipientId,
      apiKeyId: ctx.apiKeyId,
      content: request.message,
    });

    const initialStatus = scenario?.initialProviderStatus ?? "ACCEPTED";
    const delayMs = scenario?.delayMs ?? DEFAULT_DELAY_MS;
    const finalStatus = scenario?.finalDeliveryStatus ?? "DELIVERED";

    const execution = await simulatorRepository.createExecution({
      scenario: scenario ? { connect: { id: scenario.id } } : undefined,
      recipient: { connect: { id: ctx.recipientId } },
      matchedTriggerType: scenario?.triggerType,
      initialStatus,
      delayMsApplied: delayMs,
      errorCode: scenario?.errorCode,
      errorMessage: scenario?.errorMessage,
    });

    if (initialStatus !== "ACCEPTED") {
      return {
        status: initialStatus === "UNAVAILABLE" ? "ERROR" : initialStatus,
        errorCode: scenario?.errorCode ?? undefined,
        errorMessage: scenario?.errorMessage ?? "Simulated provider rejection",
        raw: { simulated: true, scenarioId: scenario?.id, executionId: execution.id },
      };
    }

    const providerMessageId = `sim_${randomUUID()}`;

    try {
      await queues.smsDelivery.add(
        "deliver",
        {
          recipientId: ctx.recipientId,
          providerMessageId,
          finalStatus,
          errorCode: scenario?.errorCode ?? undefined,
          errorMessage: scenario?.errorMessage ?? undefined,
          executionId: execution.id,
        },
        { delay: delayMs, jobId: `delivery-${ctx.recipientId}` },
      );
    } catch (error) {
      // Scheduling the delayed callback is best-effort infrastructure, same as a real
      // provider's own webhook delivery could fail — the sms-delivery status will stay
      // PROCESSING until reconciled; this must never fail the accepted send itself.
      logger.error({ err: error, recipientId: ctx.recipientId }, "Failed to schedule simulated delivery event");
    }

    return {
      status: "ACCEPTED",
      providerMessageId,
      raw: { simulated: true, scenarioId: scenario?.id, executionId: execution.id },
    };
  }

  async getDeliveryStatus(): Promise<DeliveryStatusResult> {
    // The simulator never receives polling calls in this implementation — delivery is
    // always pushed via the scheduled sms-delivery job / webhook pipeline instead.
    return { status: "PENDING", raw: { simulated: true } };
  }
}
