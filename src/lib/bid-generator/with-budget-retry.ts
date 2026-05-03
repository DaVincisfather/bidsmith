import { verifyFieldBudgets } from "@/lib/pptx-template/verify-budgets";
import type { FieldBudgets, OverflowFlag } from "@/lib/pptx-template/budget-types";
import { appendOverflowList } from "./append-overflow-list";

export type RetryBudget = { remaining: number };

export type WithBudgetRetryParams<T> = {
  basePrompt: string;
  callLLM: (prompt: string) => Promise<T>;
  budgets: FieldBudgets;
  retryBudget: RetryBudget;
};

export async function withBudgetRetry<T>(
  params: WithBudgetRetryParams<T>,
): Promise<{ output: T; overflows: OverflowFlag[] }> {
  const { basePrompt, callLLM, budgets, retryBudget } = params;
  let output = await callLLM(basePrompt);
  let { overflows } = verifyFieldBudgets(output, budgets);

  if (overflows.length === 0) return { output, overflows };

  if (retryBudget.remaining <= 0) {
    console.warn(
      `[corrector] retry-cap reached — flagging ${overflows.length} overflows without retry`,
    );
    return { output, overflows };
  }

  retryBudget.remaining -= 1;
  const tightened = appendOverflowList(basePrompt, overflows);
  output = await callLLM(tightened);
  ({ overflows } = verifyFieldBudgets(output, budgets));
  return { output, overflows };
}
