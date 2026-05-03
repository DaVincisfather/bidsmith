import { z } from "zod";

export const FieldBudgetsSchema = z.record(z.string(), z.number().int().positive());

export type FieldBudgets = z.infer<typeof FieldBudgetsSchema>;

export const OverflowFlagSchema = z.object({
  slide: z.number().int().nonnegative(),
  fieldPath: z.string(),
  fieldLabel: z.string(),
  length: z.number().int().nonnegative(),
  budget: z.number().int().positive(),
});

export type OverflowFlag = z.infer<typeof OverflowFlagSchema>;
