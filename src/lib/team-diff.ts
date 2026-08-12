import type { ScoredConsultant } from "@/lib/types";

export interface SwapComparison {
  removed: string[];
  added: string[];
  prevWinProbability: number;
}

/**
 * Diffs two locked teams for the go/no-go before/after panel. Names resolve
 * from the match pool — a deleted consultant degrades to a label, never a crash.
 */
export function deriveSwapComparison(
  prev: { teamConsultantIds: string[]; result: { winProbability: number } },
  current: { teamConsultantIds: string[] },
  pool: ScoredConsultant[],
): SwapComparison | null {
  const prevIds = new Set(prev.teamConsultantIds);
  const currIds = new Set(current.teamConsultantIds);
  const removed = prev.teamConsultantIds.filter((id) => !currIds.has(id));
  const added = current.teamConsultantIds.filter((id) => !prevIds.has(id));
  if (removed.length === 0 && added.length === 0) return null;
  const name = (id: string) =>
    pool.find((c) => c.consultantId === id)?.consultantName ?? "okänd konsult";
  return {
    removed: removed.map(name),
    added: added.map(name),
    prevWinProbability: prev.result.winProbability,
  };
}
