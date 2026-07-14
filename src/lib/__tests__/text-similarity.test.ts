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

  it("returns raw similarity — no rounding that could cross a threshold", () => {
    // Fixture found by trial: raw trigram-Jaccard = 0.675 (in (0.65, 0.7)).
    // The old implementation rounded to 2 decimals (0.675 → 0.68) before the
    // CLI compared against FAIL_AT = 0.7, so raw values in [0.695, 0.7) would
    // round to 0.70 and wrongly fail the gate. Contract: duplicatePairs
    // returns the raw value; consumers round for display only.
    const a = { label: "A", text: "Vi är en oberoende rådgivare med lång erfarenhet av offentlig sektor." };
    const b = { label: "B", text: "Vi är en fristående rådgivare med mångårig erfarenhet av offentlig sektor." };
    const pairs = duplicatePairs([a, b], 0.5);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].similarity).toBeGreaterThan(0.5);
    expect(pairs[0].similarity).toBeLessThan(0.7);
    // Exact raw passthrough — fails if any rounding is reintroduced.
    expect(pairs[0].similarity).toBe(trigramSimilarity(a.text, b.text));
  });
});
