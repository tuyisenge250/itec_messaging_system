import { z } from "zod";

export const sendMessageSchema = z.object({
  senderIdId: z.string().min(1),
  recipients: z.array(z.string().min(5).max(20)).min(1).max(5000),
  content: z.string().min(1).max(1600),
  clientReference: z.string().trim().max(200).optional(),
  scheduledAt: z.string().datetime().optional(),
});

export const listMessagesQuerySchema = z.object({
  status: z
    .enum(["SCHEDULED", "QUEUED", "PROCESSING", "SENT", "DELIVERED", "PARTIALLY_DELIVERED", "FAILED", "EXPIRED", "REJECTED", "CANCELLED"])
    .optional(),
  cursor: z.string().optional(),
});
