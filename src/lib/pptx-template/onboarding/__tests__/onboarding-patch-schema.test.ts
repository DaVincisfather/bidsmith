import { describe, it, expect } from "vitest";
import { OnboardingPatchSchema } from "@/lib/api-schemas";

describe("OnboardingPatchSchema", () => {
  it("accepterar slot-beslut (befintlig form)", () => {
    const r = OnboardingPatchSchema.safeParse({ source: 2, shapeIndex: 1, decision: "confirmed" });
    expect(r.success).toBe(true);
  });

  it("accepterar slide-beslut", () => {
    const r = OnboardingPatchSchema.safeParse({ slide: 2, decision: "skipped" });
    expect(r.success).toBe(true);
    if (r.success) expect("slide" in r.data).toBe(true);
  });

  it("avvisar confirmed som slide-beslut (fast slide kan bara skippas/ångras)", () => {
    expect(OnboardingPatchSchema.safeParse({ slide: 2, decision: "confirmed" }).success).toBe(false);
  });

  it("avvisar slide-beslut utan slide-nummer", () => {
    expect(OnboardingPatchSchema.safeParse({ decision: "skipped" }).success).toBe(false);
  });
});
