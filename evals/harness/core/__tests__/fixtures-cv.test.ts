import { describe, it, expect } from "vitest";
import { CvFixtureSchema } from "../fixtures";

describe("CvFixtureSchema", () => {
  it("accepterar en giltig CV-fixture", () => {
    const raw = {
      id: "anna_svensson",
      cv_text: "Anna Svensson — senior konsult ...",
      golden: { competency_count: 7 },
    };
    const parsed = CvFixtureSchema.parse(raw);
    expect(parsed.id).toBe("anna_svensson");
    expect(parsed.golden.competency_count).toBe(7);
  });

  it("avvisar negativt competency_count", () => {
    const raw = { id: "x", cv_text: "text", golden: { competency_count: -1 } };
    expect(CvFixtureSchema.safeParse(raw).success).toBe(false);
  });

  it("avvisar saknad cv_text", () => {
    const raw = { id: "x", golden: { competency_count: 3 } };
    expect(CvFixtureSchema.safeParse(raw).success).toBe(false);
  });
});
