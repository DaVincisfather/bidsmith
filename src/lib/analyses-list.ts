import type { RfpAnalysis } from "./types";

// Analyslistan i arbetsytan visar ALLA analyser oberoende av deadline/status —
// till skillnad från pipeline-railen (som medvetet bara visar framåtblickande,
// icke-inlämnade). Utan denna lista blev en analys med passerad eller saknad
// deadline oåtkomlig (BUG-B): den fanns i DB men listades ingenstans.

export interface AnalysisListItem {
  id: string;
  title: string;
  client: string | null;
  deadline: string | null;
  deadlinePassed: boolean;
  status: "exported" | "draft" | "none";
}

export interface AnalysisRow {
  id: string;
  analysis: RfpAnalysis;
  documents?: { file_name: string } | null;
}

export interface BidStatusRow {
  analysis_id: string;
  status: string;
  exported_at?: string | null;
}

/**
 * Mappar analysrader (antas redan sorterade nyast först) + anbudsrader till
 * list-items. `today` som ISO-datum (YYYY-MM-DD) avgör om deadline passerat.
 * Exporterat slår utkast när ett anbud finns per analys.
 */
export function buildAnalysisListItems(
  analyses: AnalysisRow[],
  bids: BidStatusRow[],
  today: string,
): AnalysisListItem[] {
  const statusByAnalysis = new Map<string, "exported" | "draft">();
  for (const b of bids) {
    const isExported = b.status === "exported" || Boolean(b.exported_at);
    if (isExported) {
      statusByAnalysis.set(b.analysis_id, "exported");
    } else if (statusByAnalysis.get(b.analysis_id) !== "exported") {
      statusByAnalysis.set(b.analysis_id, "draft");
    }
  }

  return analyses.map((a) => {
    const deadline = a.analysis?.deadline ?? null;
    return {
      id: a.id,
      title: a.analysis?.title ?? a.documents?.file_name ?? "Namnlös RFP",
      client: a.analysis?.client ?? null,
      deadline,
      deadlinePassed: deadline !== null && deadline < today,
      status: statusByAnalysis.get(a.id) ?? "none",
    };
  });
}
