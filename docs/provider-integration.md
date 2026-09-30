# Adding a real provider

This is the concrete checklist for replacing (or adding alongside) the simulator with a real SMS provider (MTN, Airtel, ...) or a real payment provider. Nothing here requires touching `modules/messaging/`, `modules/billing/payment-service.ts`, or any route handler — that's the point of the abstraction described in `docs/architecture.md`.

## SMS provider

### 1. Implement the adapter

Create `modules/providers/mtn-sms-provider.ts` (or wherever makes sense) implementing `SmsProvider` from `modules/providers/sms-provider.ts`:

```ts
export interface SmsProvider {
  sendSms(request: SendSmsRequest): Promise<SendSmsResult>;
  getDeliveryStatus(providerMessageId: string): Promise<DeliveryStatusResult>;
}
```

`sendSms` must return **immediately** with the provider's synchronous accept/reject response — `ACCEPTED | REJECTED | TIMEOUT | ERROR`. Do not attempt to wait for final delivery inside this call; that arrives later via the provider's own webhook (see step 3). Map the real provider's response codes onto this normalized `ProviderCallStatus`; do not leak the provider's own response shape past this adapter — `raw` exists in `SendSmsResult` exactly so the un-normalized payload can still be logged (`ProviderTransaction.responsePayload`) without polluting the domain types every other module works with.

`request.simulatorContext` is simulator-only — a real adapter ignores it entirely.

Respect the operational limits from the `ProviderConfig` row passed to you (rate limit/sec, max concurrency, timeout, retry count) — don't hardcode them in the adapter. `send-processor.ts` already enforces the retry-count ceiling and circuit breaker around whatever your adapter returns; the adapter itself is only responsible for one call with a proper timeout.

### 2. Register it in the factory

`modules/providers/factory.ts::resolveSmsProvider` is the only place that needs a new `case`:

```ts
switch (config.providerCode) {
  case "simulator": return { provider: new SimulatorSmsProvider(), config };
  case "mtn":        return { provider: new MtnSmsProvider(config), config };  // add this
  ...
}
```

### 3. Implement the inbound webhook

Add a case to `app/api/webhooks/[provider]/route.ts` for the new provider code (`if (provider === "mtn")`) that:

1. Verifies the signature using that provider's own scheme (HMAC, or whatever they use — do not reuse `SIMULATOR_WEBHOOK_SECRET`, which is simulator-only).
2. Normalizes the provider's payload into the same shape `processProviderDeliveryEvent` already expects: `{ recipientId, providerMessageId, finalStatus: "DELIVERED"|"FAILED"|"EXPIRED"|"UNDELIVERED", errorCode?, errorMessage? }`.

The hard part here is usually: **how do you get from the provider's own message ID back to our `recipientId`?** `MessageRecipient.providerMessageId` is populated at send time and has a `@@unique([providerCode, providerMessageId])` constraint specifically so you can look it up: `prisma.messageRecipient.findFirst({ where: { providerCode: "mtn", providerMessageId: theIdFromTheWebhook } })`. If the provider's webhook doesn't carry your original reference back to you at all, check whether their API supports passing a client reference through — `SendSmsRequest.clientReference` is threaded through for exactly this.

3. Calls `processProviderDeliveryEvent(...)` from `modules/webhooks/inbound-processor.ts` — do not write your own status-update logic; that function's idempotency guarantee (duplicate/replayed webhooks are safely ignored) and aggregate-recompute logic is exactly what you want, and it's already tested (`tests/`).

### 4. Seed a `ProviderConfig` row

```ts
await prisma.providerConfig.upsert({
  where: { providerCode_environment_providerType: { providerCode: "mtn", environment: "PRODUCTION", providerType: "SMS" } },
  create: {
    providerType: "SMS", providerCode: "mtn", displayName: "MTN Rwanda", environment: "PRODUCTION",
    isActive: true, priority: 200,  // higher than the simulator's 100, so it's picked first
    rateLimitPerSecond: ..., maxConcurrency: ..., timeoutMs: ..., retryCount: ...,
    backoffBaseMs: ..., circuitBreakerFailureThreshold: ..., circuitBreakerCooldownMs: ...,
  },
  update: {},
});
```

`resolveSmsProvider` picks the highest-`priority` active config for the given kind+environment — set the real provider's priority above the simulator's (100) so it takes over once activated, without deleting the simulator config (useful to keep sandbox on the simulator even after production has a real provider).

### 5. Credentials

**Never** put real API keys/secrets in `ProviderConfig.settings` — that field is documented non-secret configuration only. Use the `ProviderCredential` model (`providerConfigId`, `key`, `encryptedValue` via `shared/utils/encryption.ts`, `status: ACTIVE|ROTATED|REVOKED`) for anything sensitive, or environment variables for values that don't need runtime rotation. Never log a credential — the structured logger already redacts common secret-shaped field names, but don't rely on that as the only safeguard; don't pass credentials into any logged object in the first place.

### 6. Sandbox vs production

Keep the simulator active for `SANDBOX` even after wiring up the real provider for `PRODUCTION` — this is exactly what `Environment`-scoped `ProviderConfig` rows are for. A sandbox API key should never be able to reach the real provider; `verifyApiKeyToken`'s environment check already prevents this at the API-key layer regardless of provider wiring.

## Payment provider

Same shape, smaller surface. Implement `PaymentProvider` from `modules/billing/providers/payment-provider.ts`:

```ts
export interface PaymentProvider {
  charge(request: ChargeRequest): Promise<ChargeResult>;
}
```

Register it in `modules/billing/providers/index.ts`'s factory (driven by the `PAYMENT_PROVIDER` env var today — `simulator | real`; extend that switch, or move to the same `ProviderConfig`-row-driven pattern as SMS if multiple real payment providers are ever needed). `ChargeResult.status` must map onto the existing `PaymentIntentStatus` outcome values (`SUCCEEDED|FAILED|TIMEOUT|CANCELLED|INSUFFICIENT_FUNDS|PROVIDER_UNAVAILABLE`) — don't add new statuses without also updating `PaymentIntentStatus` in `schema.prisma` and every place that switches on it.

If the real payment provider is redirect-and-webhook based (most are) rather than a single synchronous call, `payment-service.ts::createAndCompletePaymentIntent` will need restructuring to leave the intent `PROCESSING` after `charge()` returns and complete it from a webhook instead — follow the SMS inbound-webhook pattern above (idempotent processor function, looked up by a provider reference stored on `PaymentIntent.providerReference`) rather than inventing a new one. Whatever you do, **the wallet credit must stay inside the same transaction as the `PaymentIntent` status flip to `SUCCEEDED`**, exactly as it is today — this is what guarantees "credited exactly once," not the idempotency key alone.

## Testing a new provider

Before switching production traffic to it: point a `ProviderConfig` row at it with `environment: SANDBOX` and a very low `priority` isn't enough on its own to exercise it (the simulator will still win at equal-or-higher priority) — temporarily raise its priority in sandbox, or add a scenario-equivalent test rig. `modules/simulator/simulator-sms-provider.ts` is a reasonable reference for what a `SendSmsResult`/circuit-breaker-friendly adapter should look like end to end, even though a real adapter won't need the scenario-matching logic itself.
