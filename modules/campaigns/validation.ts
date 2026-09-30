import { z } from "zod";

// NOTE: Campaign has no `content` field of its own in this schema — only
// `templateId` — so a campaign's message content always comes from its
// Template. See modules/campaigns/service.ts.
export const createCampaignSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    senderIdId: z.string().min(1),
    templateId: z.string().min(1),
    contactGroupId: z.string().min(1),
    batchSize: z.number().int().min(1).max(5000).optional(),
    scheduledAt: z.string().datetime().optional(),
    isRecurring: z.boolean().optional(),
    recurrenceInterval: z.enum(["DAILY", "WEEKLY", "MONTHLY"]).optional(),
    recurrenceEndAt: z.string().datetime().optional(),
  })
  .refine((data) => !data.isRecurring || Boolean(data.scheduledAt), {
    message: "A recurring campaign needs a scheduledAt (its first run time)",
    path: ["scheduledAt"],
  })
  .refine((data) => !data.isRecurring || Boolean(data.recurrenceInterval), {
    message: "A recurring campaign needs a recurrenceInterval",
    path: ["recurrenceInterval"],
  });
