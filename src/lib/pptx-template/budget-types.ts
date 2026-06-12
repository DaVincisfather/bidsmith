import { z } from "zod";

export const FieldBudgetsSchema = z.record(z.string(), z.number().int().positive());

export type FieldBudgets = z.infer<typeof FieldBudgetsSchema>;

export interface BudgetPlan {
  budgets: FieldBudgets;
  /** fältsökväg → 1-indexerad deck-slide (ur manifestet; ersätter FIELD_METADATA.slide) */
  fieldSlides: Record<string, number>;
}

export const OverflowFlagSchema = z.object({
  slide: z.number().int().nonnegative(),
  fieldPath: z.string(),
  fieldLabel: z.string(),
  length: z.number().int().nonnegative(),
  budget: z.number().int().positive(),
});

export type OverflowFlag = z.infer<typeof OverflowFlagSchema>;
