import { z } from "zod";

export const createSenderIdRequestSchema = z.object({
  environment: z.enum(["SANDBOX", "PRODUCTION"]),
  requestedValue: z
    .string()
    .trim()
    .min(3)
    .max(11)
    .regex(/^[A-Za-z0-9 ]+$/, "Sender ID may only contain letters, numbers, and spaces"),
  purpose: z.string().trim().max(1000).optional(),
  sampleMessageContent: z.string().trim().max(500).optional(),
});

export const updateSenderIdRequestSchema = z.object({
  purpose: z.string().trim().max(1000).optional(),
  sampleMessageContent: z.string().trim().max(500).optional(),
});

export const reviewSenderIdRequestSchema = z.object({
  toStatus: z.enum([
    "UNDER_REVIEW",
    "DOCUMENTS_REQUIRED",
    "RURA_SUBMITTED",
    "RURA_INFORMATION_REQUESTED",
    "RURA_APPROVED",
    "RURA_REJECTED",
    "MNO_WHITELISTING",
  ]),
  notes: z.string().trim().max(2000).optional(),
  ruraReferenceNumber: z.string().trim().max(200).optional(),
});

export const rejectSenderIdRequestSchema = z.object({
  notes: z.string().trim().max(2000).optional(),
});

export const approveSenderIdRequestSchema = z.object({
  mnoNotes: z.string().trim().max(2000).optional(),
});
