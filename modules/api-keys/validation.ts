import { z } from "zod";

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(150),
  environment: z.enum(["SANDBOX", "PRODUCTION"]),
  scopes: z.array(z.string().min(1)).min(1),
});
