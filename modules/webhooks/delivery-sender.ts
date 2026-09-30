import { prisma } from "@/infrastructure/database/prisma";
import { hmacSha256Hex } from "@/shared/utils/crypto";
import { decryptSecret } from "@/shared/utils/encryption";
import { assertPubliclyRoutableUrl } from "@/shared/utils/url-safety";
import { logger } from "@/infrastructure/logging/logger";

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Executed by the webhook-processing BullMQ worker for one WebhookDelivery
 * row. Throws on failure so BullMQ retries with backoff; `isFinalAttempt`
 * tells us whether to mark EXHAUSTED instead of leaving it retryable.
 */
export async function processWebhookDispatchJob(webhookDeliveryId: string, isFinalAttempt: boolean): Promise<void> {
  const delivery = await prisma.webhookDelivery.findUnique({ where: { id: webhookDeliveryId }, include: { webhook: true } });
  if (!delivery) {
    logger.warn({ webhookDeliveryId }, "webhook dispatch job for unknown delivery — skipping");
    return;
  }
  if (delivery.status === "DELIVERED") return; // already succeeded on a prior attempt

  const body = JSON.stringify({ event: delivery.eventType, data: delivery.payload, deliveryId: delivery.id });
  const secret = decryptSecret(delivery.webhook.secretEncrypted);
  const signature = hmacSha256Hex(secret, body);

  const attempts = delivery.attempts + 1;

  try {
    // Re-validate at dispatch time, not just at registration — DNS can be
    // repointed to an internal address between when the customer registered
    // the URL and when we actually dispatch to it (rebinding).
    await assertPubliclyRoutableUrl(delivery.webhook.url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(delivery.webhook.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Webhook-Signature": signature },
        body,
        signal: controller.signal,
        // A redirect target isn't re-validated against the SSRF allowlist, so
        // never follow one — the customer's receiver shouldn't be redirecting.
        redirect: "manual",
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
      throw new Error("Webhook endpoint responded with a redirect, which is not followed");
    }
    if (!response.ok) {
      throw new Error(`Webhook endpoint responded with status ${response.status}`);
    }

    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: "DELIVERED", responseStatus: response.status, attempts, lastAttemptAt: new Date() },
    });
  } catch (error) {
    const status = isFinalAttempt ? "EXHAUSTED" : "PENDING";
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status, attempts, lastAttemptAt: new Date() },
    });
    throw error;
  }
}
