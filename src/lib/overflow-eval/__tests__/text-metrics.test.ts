import { describe, it, expect } from "vitest";
import { collectDuplicates, collectFill, totalProseChars } from "../text-metrics";
import type { SlotMeta } from "@/lib/bid-editor/slot-meta";
import type { BidSection } from "@/lib/types";

const meta: SlotMeta = {
  "{A}": { slide: 3, shortField: false, intent: "a", budgetChars: 540 },
  "{B}": { slide: 3, shortField: false, intent: "b", budgetChars: 540 },
  "{C}": { slide: 5, shortField: false, intent: "c", budgetChars: 400 },
  "{Dnr}": { slide: 3, shortField: true, intent: "dnr", budgetChars: 40 },
};
function sec(placeholder: string, text: string): BidSection {
  return { type: "ai", key: placeholder, title: placeholder, generatedAt: "", content: { format: "generic-prose", placeholder, text } } as BidSection;
}
const långText = "Vi kartlägger styrmodellen i fyra steg med intervjuer och workshops. ".repeat(3);

describe("text-metrics", () => {
  it("hittar par ≥0,3 på samma slide, ignorerar olika slides och korta texter", () => {
    const d = collectDuplicates(
      [sec("{A}", långText), sec("{B}", långText), sec("{C}", långText), sec("{Dnr}", "123")],
      meta,
    );
    expect(d).toHaveLength(1);
    expect(d[0].slide).toBe(3);
    expect(d[0].similarity).toBeGreaterThan(0.9);
  });

  it("fyllnad räknas bara på prosa-rutor (budget > 80)", () => {
    const f = collectFill([sec("{A}", "kort"), sec("{Dnr}", "123")], meta);
    expect(f).toHaveLength(1);
    expect(f[0].placeholder).toBe("{A}");
    expect(f[0].ratio).toBeCloseTo(4 / 540, 3);
  });

  it("undantar slots vars intent sanktionerar tomhet (beslut B: 'lämnas tom')", () => {
    const m: SlotMeta = {
      ...meta,
      "{Sektionsnummer 3}": {
        slide: 9, shortField: false, budgetChars: 110,
        intent: "Sektionsnummer/rubriketikett för referensavsnittet. Lämnas tom för generation, vi fyller på med referensuppdrag",
      },
    };
    const f = collectFill([sec("{Sektionsnummer 3}", "07"), sec("{A}", "kort")], m);
    expect(f.map((e) => e.placeholder)).toEqual(["{A}"]);
  });

  it("totalvolym summerar generic-prose-text", () => {
    expect(totalProseChars([sec("{A}", "abc"), sec("{C}", "de")])).toBe(5);
  });
});
