import { describe, it, expect } from "vitest";
import { BidGeneratorFixtureSchema } from "../fixtures";
import fs from "fs/promises";
import path from "path";
import { loadFixtureFromString } from "../fixture-loader";

describe("BidGeneratorFixtureSchema", () => {
  it("parses minimal valid fixture", () => {
    const raw = {
      id: "stub",
      analyzer_fixture: "_stub",
      consultant_ids: ["c1", "c2"],
      golden: {
        mandatory_sections: ["cover", "team-pricing"],
        requirement_coverage: { must_cover: [], should_cover_threshold: 0.8 },
        hallucination_allowlist: [],
      },
    };
    const parsed = BidGeneratorFixtureSchema.parse(raw);
    expect(parsed.id).toBe("stub");
    expect(parsed.consultant_ids).toEqual(["c1", "c2"]);
    expect(parsed.golden.requirement_coverage.should_cover_threshold).toBe(0.8);
  });

  it("applies default for should_cover_threshold", () => {
    const raw = {
      id: "stub",
      analyzer_fixture: "_stub",
      consultant_ids: ["c1"],
      golden: {
        mandatory_sections: ["cover"],
        requirement_coverage: { must_cover: [] },
        hallucination_allowlist: [],
      },
    };
    const parsed = BidGeneratorFixtureSchema.parse(raw);
    expect(parsed.golden.requirement_coverage.should_cover_threshold).toBe(0.8);
  });

  it("rejects fixture missing consultant_ids", () => {
    const raw = { id: "x", analyzer_fixture: "_stub", golden: {} };
    expect(() => BidGeneratorFixtureSchema.parse(raw)).toThrow();
  });
});

describe("BidGenerator _stub fixture", () => {
  it("loads from disk and parses", async () => {
    const filePath = path.resolve("evals/fixtures/bid-generator/_stub.yaml");
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = loadFixtureFromString(content, BidGeneratorFixtureSchema, "_stub.yaml");
    expect(parsed.id).toBe("_stub");
    expect(parsed.consultant_ids.length).toBeGreaterThanOrEqual(2);
    expect(parsed.golden.mandatory_sections).toContain("cover");
  });
});
