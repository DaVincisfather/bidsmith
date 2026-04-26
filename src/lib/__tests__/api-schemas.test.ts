import { describe, it, expect } from "vitest";
import {
  BidPatchSchema,
  OutcomePatchSchema,
  BidCreateSchema,
  ConsultantUpdateSchema,
  GoNoGoCreateSchema,
  GoNoGoDecisionPatchSchema,
  OpportunityStatusPatchSchema,
} from "@/lib/api-schemas";

describe("BidPatchSchema", () => {
  it("accepts outcome alone", () => {
    expect(BidPatchSchema.safeParse({ outcome: "won" }).success).toBe(true);
  });
  it("accepts sections alone", () => {
    expect(BidPatchSchema.safeParse({ sections: [{ key: "x" }] }).success).toBe(true);
  });
  it("rejects empty patch", () => {
    expect(BidPatchSchema.safeParse({}).success).toBe(false);
  });
  it("rejects invalid outcome enum", () => {
    expect(BidPatchSchema.safeParse({ outcome: "cancelled" }).success).toBe(false);
  });
});

describe("OutcomePatchSchema", () => {
  it("accepts outcome=won with no extras", () => {
    expect(OutcomePatchSchema.safeParse({ outcome: "won" }).success).toBe(true);
  });
  it("accepts outcome=cancelled (full enum)", () => {
    expect(OutcomePatchSchema.safeParse({ outcome: "cancelled" }).success).toBe(true);
  });
  it("rejects unknown lossReason", () => {
    const r = OutcomePatchSchema.safeParse({ outcome: "lost", lossReason: "nope" });
    expect(r.success).toBe(false);
  });
  it("rejects missing outcome", () => {
    expect(OutcomePatchSchema.safeParse({}).success).toBe(false);
  });
});

describe("BidCreateSchema", () => {
  it("accepts minimal valid input", () => {
    const r = BidCreateSchema.safeParse({
      analysisId: "abc",
      teamConsultantIds: ["c1"],
    });
    expect(r.success).toBe(true);
  });
  it("rejects empty teamConsultantIds", () => {
    expect(
      BidCreateSchema.safeParse({ analysisId: "abc", teamConsultantIds: [] }).success
    ).toBe(false);
  });
  it("rejects empty analysisId", () => {
    expect(
      BidCreateSchema.safeParse({ analysisId: "", teamConsultantIds: ["c1"] }).success
    ).toBe(false);
  });
});

describe("ConsultantUpdateSchema", () => {
  it("accepts base fields without competencies/references", () => {
    const r = ConsultantUpdateSchema.safeParse({
      name: "Alice",
      level: "senior",
      yearsExperience: 10,
      summary: "Experienced",
    });
    expect(r.success).toBe(true);
  });
  it("rejects unknown level", () => {
    expect(
      ConsultantUpdateSchema.safeParse({
        name: "Alice",
        level: "godlike",
        yearsExperience: 10,
        summary: "x",
      }).success
    ).toBe(false);
  });
  it("rejects empty name", () => {
    expect(
      ConsultantUpdateSchema.safeParse({
        name: "",
        level: "senior",
        yearsExperience: 10,
        summary: "x",
      }).success
    ).toBe(false);
  });
});

describe("GoNoGoCreateSchema", () => {
  it("accepts analysisId alone", () => {
    expect(GoNoGoCreateSchema.safeParse({ analysisId: "a" }).success).toBe(true);
  });
  it("rejects missing analysisId", () => {
    expect(GoNoGoCreateSchema.safeParse({}).success).toBe(false);
  });
});

describe("GoNoGoDecisionPatchSchema", () => {
  it("accepts decision=go", () => {
    expect(GoNoGoDecisionPatchSchema.safeParse({ decision: "go" }).success).toBe(true);
  });
  it("rejects decision=undecided", () => {
    expect(
      GoNoGoDecisionPatchSchema.safeParse({ decision: "undecided" }).success
    ).toBe(false);
  });
});

describe("OpportunityStatusPatchSchema", () => {
  it("accepts status=dismissed", () => {
    expect(
      OpportunityStatusPatchSchema.safeParse({ status: "dismissed" }).success
    ).toBe(true);
  });
  it("rejects status=analyzed (typo for analyzing)", () => {
    expect(
      OpportunityStatusPatchSchema.safeParse({ status: "analyzed" }).success
    ).toBe(false);
  });
});
