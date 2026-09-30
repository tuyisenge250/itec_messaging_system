import { z } from "zod";

const WEBHOOK_EVENTS = ["message.delivered", "message.failed"] as const;

export const createWebhookSchema = z.object({
  environment: z.enum(["SANDBOX", "PRODUCTION"]),
  url: z.string().trim().url(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
});

export const updateWebhookSchema = z.object({
  url: z.string().trim().url().optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional(),
  isActive: z.boolean().optional(),
});
