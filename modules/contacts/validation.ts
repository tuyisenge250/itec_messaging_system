import { z } from "zod";

export const createContactSchema = z.object({
  phoneNumber: z.string().min(5).max(20),
  firstName: z.string().trim().max(150).optional(),
  lastName: z.string().trim().max(150).optional(),
  email: z.string().trim().email().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  isSubscribed: z.boolean().optional(),
});

export const updateContactSchema = createContactSchema.partial().omit({ phoneNumber: true });

export const createContactGroupSchema = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(500).optional(),
});
