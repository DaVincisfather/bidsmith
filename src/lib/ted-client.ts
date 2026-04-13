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
  // Only fetch notices published in the last 30 days
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sinceStr = since.toISOString().slice(0, 10).replace(/-/g, "");
  return `buyer-country = SWE AND classification-cpv IN (${cpvList}) AND publication-date > ${sinceStr}`;
}

// Extract localized text, preferring Swedish then English then first available
/* eslint-disable @typescript-eslint/no-explicit-any */
function extractLocalizedText(field: any): string | null {
  if (!field || typeof field !== "object") return null;
  return field["swe"] ?? field["eng"] ?? Object.values(field)[0] ?? null;
}

// Extract first element from a localized array field like buyer-name: {"swe": ["Name"]}
function extractLocalizedArray(field: any): string | null {
  if (!field || typeof field !== "object") return null;
  const arr = field["swe"] ?? field["eng"] ?? Object.values(field)[0];
  return Array.isArray(arr) ? arr[0] ?? null : null;
}

export function parseTedNotice(raw: Record<string, any>): TedSearchResult {
  const pubNumber = raw["publication-number"] ?? "";
  const links = raw["links"];
  const tedUrl = links?.html?.["SWE"] ?? links?.html?.["ENG"] ?? null;
  const xmlUrl = links?.xml?.["MUL"] ?? null;

  return {
    tedNoticeId: pubNumber,
    title: extractLocalizedText(raw["notice-title"]) ?? "Untitled",
    buyer: extractLocalizedArray(raw["buyer-name"]),
    country: Array.isArray(raw["buyer-country"]) ? raw["buyer-country"][0] ?? "SWE" : "SWE",
    cpvCodes: Array.isArray(raw["classification-cpv"]) ? raw["classification-cpv"] : [],
    deadline: raw["deadline-receipt-tender-date-lot"]?.[0] ?? null,
    estimatedValue: parseFloat(raw["estimated-value-lot"]?.[0]) || null,
    summary: extractLocalizedText(raw["description-lot"]?.[0]) ?? null,
    tedUrl,
    rawXml: xmlUrl,
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
      query,
      fields: [
        "publication-number",
        "notice-title",
        "buyer-name",
        "buyer-country",
        "classification-cpv",
        "deadline-receipt-tender-date-lot",
        "estimated-value-lot",
        "description-lot",
        "links",
      ],
      limit,
      page: 1,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`TED API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const notices: Record<string, any>[] = data.notices ?? [];
  return notices.map(parseTedNotice);
}
