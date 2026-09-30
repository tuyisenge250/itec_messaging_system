import { z } from "zod";

const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

export function extractTemplateVariables(content: string): string[] {
  const names = new Set<string>();
  for (const match of content.matchAll(VARIABLE_PATTERN)) names.add(match[1]);
  return Array.from(names);
}

export function renderTemplate(content: string, variables: Record<string, string>): string {
  return content.replace(VARIABLE_PATTERN, (full, name) => variables[name] ?? full);
}

export const createTemplateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  content: z.string().trim().min(1).max(1600),
  category: z.string().trim().max(100).optional(),
});

export const updateTemplateSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  content: z.string().trim().min(1).max(1600).optional(),
  category: z.string().trim().max(100).optional(),
  isActive: z.boolean().optional(),
});
