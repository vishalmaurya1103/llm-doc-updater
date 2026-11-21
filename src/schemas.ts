import { z } from "zod";

export interface InputLimits {
  maxDocumentChars: number;
  maxChanges: number;
  maxChangeChars: number;
}

export const DEFAULT_LIMITS: InputLimits = {
  maxDocumentChars: 400_000,
  maxChanges: 50,
  maxChangeChars: 2_000,
};

export function createRequestSchema(limits: InputLimits = DEFAULT_LIMITS) {
  return z.object({
    sourceDocument: z.string().max(limits.maxDocumentChars, `sourceDocument exceeds ${limits.maxDocumentChars} characters`),
    changes: z
      .array(
        z.string().trim().min(1).max(limits.maxChangeChars, `each change must be at most ${limits.maxChangeChars} characters`),
      )
      .max(limits.maxChanges, `at most ${limits.maxChanges} changes per request`),
  });
}

export const PlanSchema = z.object({
  changes: z.array(
    z.object({
      index: z.number().int(),
      applicable: z.boolean(),
      ambiguous: z.boolean(),
      scope: z.enum(["local", "global"]),
      styleOnly: z.boolean(),
      blockIds: z.array(z.string()),
      rationale: z.string(),
    }),
  ),
});

const EditSchema = z.object({
  id: z.string(),
  action: z.enum(["replace", "delete", "insert_after", "keep"]),
  text: z.string(),
});

export const LocalEditsSchema = z.object({
  edits: z.array(EditSchema.extend({ changeIndexes: z.array(z.number().int()) })),
  unapplied: z.array(z.object({ changeIndex: z.number().int(), reason: z.string() })),
});

export const GlobalEditsSchema = z.object({
  edits: z.array(EditSchema),
});

export type Plan = z.infer<typeof PlanSchema>;
export type PlannedChange = Plan["changes"][number];
export type LocalEdits = z.infer<typeof LocalEditsSchema>;
export type GlobalEdits = z.infer<typeof GlobalEditsSchema>;
