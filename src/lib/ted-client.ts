const TED_API_BASE = "https://api.ted.europa.eu/v3/notices/search";

export interface TedSearchResult {
  tedNoticeId: string;
  title: string;
  buyer: string | null;
  country: string;
  cpvCodes: string[];
  deadline: string | null;
  estimatedValue: number | null;
  summary: string | null;
  tedUrl: string | null;
  rawXml: string | null;
}

export function buildTedQuery(cpvCodes: string[]): string {
  const unique = [...new Set(cpvCodes)];
  const cpvList = unique.join(" ");
  return `buyer-country = SWE AND classification-cpv IN (${cpvList})`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function parseTedNotice(raw: Record<string, any>): TedSearchResult {
  return {
    tedNoticeId: raw["ND"] ?? "",
    title: raw["TI"] ?? "Untitled",
    buyer: raw["CA"] ?? null,
    country: raw["CY"] ?? "SWE",
    cpvCodes: Array.isArray(raw["PC"]) ? raw["PC"] : [],
    deadline: raw["DT"] ?? null,
    estimatedValue: typeof raw["TV"] === "number" ? raw["TV"] : null,
    summary: raw["RC"] ?? raw["SHORT_DESCR"] ?? null,
    tedUrl: raw["urls"]?.["ted"] ?? null,
    rawXml: raw["content"] ?? null,
  };
}

export async function fetchTedNotices(
  cpvCodes: string[],
  limit = 100
): Promise<TedSearchResult[]> {
  const query = buildTedQuery(cpvCodes);

  const response = await fetch(TED_API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: query,
      fields: ["ND", "TI", "CA", "CY", "PC", "DT", "TV", "RC", "SHORT_DESCR", "content"],
      pageSize: limit,
      page: 1,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`TED API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const notices: Record<string, any>[] = data.results ?? data.notices ?? [];
  return notices.map(parseTedNotice);
}
