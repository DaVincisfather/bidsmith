// Delad budget-bokföring för noll-hallucinationsloopen (RFP + CV). Utfaktoriserad
// så loop-skriptet håller sig under 300 rader när det stödjer båda target.
import { createServiceClient } from "@/lib/supabase";

/**
 * Kumulativ (all-time) summa av cost_usd för alla anrop vars label matchar
 * `likePattern`. Per-anrop-kostnad går inte att koppla per körning (logAiCall är
 * fire-and-forget utan run-id) — därför rapporterar loopen den kumulativa totalen.
 *
 * LIKE (inte eq): re-citat-anropen loggas under `<label>:requote` och CV-loopen
 * under `eval:zero-halluc-cv` — ett `eq("label", "eval:zero-halluc")` MISSADE dem
 * och undervärderade grinden (fas B-fynd). `"eval:zero-halluc%"` fångar rfp, cv
 * OCH båda requote-etiketterna.
 */
export async function fetchCumulativeLoopCost(likePattern: string): Promise<number> {
  const supabase = createServiceClient();
  // Paginerat: Supabase-JS tystnar vid 1000 rader per select — utan range-loop
  // skulle summan (och därmed budgetgrinden) tyst undervärdera efter ~250 varv.
  const PAGE = 1000;
  let sum = 0;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("ai_call_logs")
      .select("cost_usd")
      .like("label", likePattern)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const row of data ?? []) sum += Number(row.cost_usd ?? 0);
    if (!data || data.length < PAGE) break;
  }
  return sum;
}
