import { describe, it, expect } from "vitest";
import { buildTedQuery, parseTedNotice } from "@/lib/ted-client";

describe("buildTedQuery", () => {
  it("builds expert query from CPV codes with date filter", () => {
    const query = buildTedQuery(["79410000", "79412000"]);
    expect(query).toContain("buyer-country = SWE");
    expect(query).toContain("79410000");
    expect(query).toContain("79412000");
    expect(query).toMatch(/publication-date > \d{8}/);
  });

  it("deduplicates CPV codes", () => {
    const query = buildTedQuery(["79410000", "79410000", "79412000"]);
    const matches = query.match(/79410000/g);
    expect(matches).toHaveLength(1);
  });
});

describe("parseTedNotice", () => {
  it("extracts fields from TED v3 notice data", () => {
    const rawNotice = {
      "publication-number": "12345-2026",
      "notice-title": {
        swe: "Sverige-Umeå: Ekonomisystem för Region Västerbotten",
        eng: "Sweden-Umeå: Financial systems for Region Västerbotten",
      },
      "buyer-name": { swe: ["Region Västerbotten"] },
      "buyer-country": ["SWE"],
      "classification-cpv": ["79412000"],
      "deadline-receipt-tender-date-lot": ["2026-05-15"],
      "estimated-value-lot": ["2400000"],
      "description-lot": [{ swe: "Upphandling av ekonomisystem" }],
      links: {
        html: { SWE: "https://ted.europa.eu/sv/notice/-/detail/12345-2026" },
        xml: { MUL: "https://ted.europa.eu/en/notice/12345-2026/xml" },
      },
    };
    const parsed = parseTedNotice(rawNotice);
    expect(parsed.tedNoticeId).toBe("12345-2026");
    expect(parsed.title).toContain("Ekonomisystem");
    expect(parsed.buyer).toBe("Region Västerbotten");
    expect(parsed.cpvCodes).toEqual(["79412000"]);
    expect(parsed.deadline).toBe("2026-05-15");
    expect(parsed.estimatedValue).toBe(2400000);
    expect(parsed.tedUrl).toContain("ted.europa.eu");
  });

  it("handles missing optional fields gracefully", () => {
    const minimal = {
      "publication-number": "99999-2026",
      "notice-title": { swe: "Testtitel" },
    };
    const parsed = parseTedNotice(minimal);
    expect(parsed.tedNoticeId).toBe("99999-2026");
    expect(parsed.title).toBe("Testtitel");
    expect(parsed.buyer).toBeNull();
    expect(parsed.cpvCodes).toEqual([]);
    expect(parsed.deadline).toBeNull();
    expect(parsed.estimatedValue).toBeNull();
  });

  it("falls back to English when Swedish title is missing", () => {
    const notice = {
      "publication-number": "88888-2026",
      "notice-title": { eng: "English only title" },
    };
    const parsed = parseTedNotice(notice);
    expect(parsed.title).toBe("English only title");
  });
});
