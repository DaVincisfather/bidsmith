import { describe, it, expect } from "vitest";
import { buildTedQuery, parseTedNotice } from "@/lib/ted-client";

describe("buildTedQuery", () => {
  it("builds expert query from CPV codes", () => {
    const query = buildTedQuery(["79410000", "79412000"]);
    expect(query).toContain("buyer-country = SWE");
    expect(query).toContain("79410000");
    expect(query).toContain("79412000");
  });

  it("deduplicates CPV codes", () => {
    const query = buildTedQuery(["79410000", "79410000", "79412000"]);
    const matches = query.match(/79410000/g);
    expect(matches).toHaveLength(1);
  });
});

describe("parseTedNotice", () => {
  it("extracts fields from TED notice data", () => {
    const rawNotice = {
      "ND": "12345-2026",
      "TI": "Ekonomisystem för Region Västerbotten",
      "CY": "SWE",
      "CA": "Region Västerbotten",
      "PC": ["79412000"],
      "DT": "2026-05-15",
      "TV": 2400000,
      "content": "<notice>full xml here</notice>",
      "urls": { "ted": "https://ted.europa.eu/notice/12345-2026" },
    };
    const parsed = parseTedNotice(rawNotice);
    expect(parsed.tedNoticeId).toBe("12345-2026");
    expect(parsed.title).toBe("Ekonomisystem för Region Västerbotten");
    expect(parsed.buyer).toBe("Region Västerbotten");
    expect(parsed.cpvCodes).toEqual(["79412000"]);
  });

  it("handles missing optional fields gracefully", () => {
    const minimal = {
      "ND": "99999-2026",
      "TI": "Some title",
      "CY": "SWE",
    };
    const parsed = parseTedNotice(minimal);
    expect(parsed.tedNoticeId).toBe("99999-2026");
    expect(parsed.title).toBe("Some title");
    expect(parsed.buyer).toBeNull();
    expect(parsed.cpvCodes).toEqual([]);
    expect(parsed.deadline).toBeNull();
    expect(parsed.estimatedValue).toBeNull();
  });
});
