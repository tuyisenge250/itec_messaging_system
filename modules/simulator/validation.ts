import { z } from "zod";

export const createScenarioSchema = z.object({
  environment: z.enum(["SANDBOX", "PRODUCTION"]),
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(1000).optional(),
  triggerType: z.enum(["PHONE_NUMBER", "SENDER_ID", "ORGANIZATION", "MESSAGE_ID", "API_KEY", "MESSAGE_CONTENT", "RANDOM_PERCENTAGE"]),
  triggerValue: z.string().trim().max(500).optional(),
  initialProviderStatus: z.enum(["ACCEPTED", "REJECTED", "TIMEOUT", "UNAVAILABLE"]),
  finalDeliveryStatus: z.enum(["DELIVERED", "FAILED", "EXPIRED", "UNDELIVERED"]),
  delayMs: z.number().int().min(0).max(300_000).optional(),
  errorCode: z.string().trim().max(100).optional(),
  errorMessage: z.string().trim().max(500).optional(),
  probabilityPercent: z.number().min(0).max(100).optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().optional(),
});

export const updateScenarioSchema = createScenarioSchema.partial();
