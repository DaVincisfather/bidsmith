import { describe, expect, it } from "vitest";
import { duplicatePairs, trigramSimilarity } from "../text-similarity";

describe("trigramSimilarity", () => {
  it("identical texts → 1", () => {
    const t = "Vi har lång erfarenhet av offentlig sektor och arbetar metodiskt.";
    expect(trigramSimilarity(t, t)).toBe(1);
  });
  it("unrelated texts → low", () => {
    expect(
      trigramSimilarity(
        "Riskhantering sker genom en levande risklogg och styrgruppsmöten.",
        "Betalning sker månadsvis i efterskott enligt avtalad prislista.",
      ),
    ).toBeLessThan(0.3);
  });
  it("near-identical variants → high (the nine 'Om oss' case)", () => {
    expect(
      trigramSimilarity(
        "Vi är en oberoende rådgivare med lång erfarenhet av offentlig sektor.",
        "Vi är en oberoende rådgivare med mångårig erfarenhet av offentlig sektor.",
      ),
    ).toBeGreaterThan(0.6);
  });
  it("is case- and punctuation-insensitive", () => {
    expect(trigramSimilarity("Vi arbetar metodiskt!", "vi arbetar metodiskt")).toBe(1);
  });
});

describe("duplicatePairs", () => {
  it("returns pairs at or above the threshold, sorted by similarity desc", () => {
    const pairs = duplicatePairs(
      [
        { label: "A", text: "Vi är en oberoende rådgivare med lång erfarenhet av offentlig sektor." },
        { label: "B", text: "Vi är en oberoende rådgivare med mångårig erfarenhet av offentlig sektor." },
        { label: "C", text: "Betalning sker månadsvis i efterskott enligt avtalad prislista." },
      ],
      0.5,
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ a: "A", b: "B" });
  });
});
