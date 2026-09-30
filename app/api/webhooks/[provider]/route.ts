import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { processProviderDeliveryEvent } from "@/modules/webhooks/inbound-processor";
import { hmacSha256Hex, safeCompare } from "@/shared/utils/crypto";
import { errorResponse, ok } from "@/shared/http/response";
import { AppError } from "@/shared/errors/app-error";
import { env } from "@/infrastructure/config/env";
import { childLogger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ provider: string }> };

const bodySchema = z.object({
  recipientId: z.string().min(1),
  providerMessageId: z.string().optional(),
  status: z.enum(["DELIVERED", "FAILED", "EXPIRED", "UNDELIVERED"]),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
});

/**
 * Provider-independent inbound webhook entry point. Identifies the provider
 * from the URL segment, verifies its signature scheme, normalizes the body,
 * and hands off to the shared processing pipeline in
 * modules/webhooks/inbound-processor.ts — the exact same function the
 * simulator's own sms-delivery worker calls directly (see
 * docs/architecture.md "Simulator architecture").
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const log = childLogger({ requestId, route: "webhooks/provider" });

  try {
    const { provider } = await params;
    const rawBody = await request.text();

    if (provider !== "simulator") {
      throw AppError.notFound(`Unknown or unconfigured provider: ${provider}`);
    }

    const signature = request.headers.get("x-webhook-signature");
    if (!signature || !safeCompare(hmacSha256Hex(env.SIMULATOR_WEBHOOK_SECRET, rawBody), signature)) {
      log.warn({ provider }, "Rejected inbound provider webhook: invalid signature");
      throw AppError.forbidden("Invalid webhook signature");
    }

    const parsed = bodySchema.safeParse(JSON.parse(rawBody));
    if (!parsed.success) {
      throw AppError.validation("Invalid webhook payload", parsed.error.flatten());
    }

    const result = await processProviderDeliveryEvent({
      recipientId: parsed.data.recipientId,
      providerMessageId: parsed.data.providerMessageId,
      finalStatus: parsed.data.status,
      errorCode: parsed.data.errorCode,
      errorMessage: parsed.data.errorMessage,
    });

    return ok(result, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
