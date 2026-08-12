import { describe, it, expect } from "vitest";
import {
  BidPatchSchema,
  OutcomePatchSchema,
  BidCreateSchema,
  ConsultantUpdateSchema,
  GoNoGoCreateSchema,
  GoNoGoDecisionPatchSchema,
  OpportunityStatusPatchSchema,
  OnboardingDecisionSchema,
  ApplySwapSchema,
} from "@/lib/api-schemas";
import { MAX_TEAM_SIZE } from "@/lib/constants";

const ASSESSMENT_ID = "11111111-1111-1111-1111-111111111111";
const REMOVE_ID = "22222222-2222-2222-2222-222222222222";
const ADD_ID = "33333333-3333-3333-3333-333333333333";

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

describe("BidPatchSchema (MD-first)", () => {
  it("rejects overflowFlags-only payloads — the field is gone", () => {
    const parsed = BidPatchSchema.safeParse({ overflowFlags: [] });
    expect(parsed.success).toBe(false);
  });

  it("accepts sections-only payloads", () => {
    const parsed = BidPatchSchema.safeParse({ sections: [] });
    expect(parsed.success).toBe(true);
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
  it("rejects more than MAX_TEAM_SIZE team ids (rider: closes the late-failure gap)", () => {
    const r = GoNoGoCreateSchema.safeParse({
      analysisId: "a",
      teamConsultantIds: Array.from({ length: MAX_TEAM_SIZE + 1 }, (_, i) => `c${i}`),
    });
    expect(r.success).toBe(false);
  });
});

describe("ApplySwapSchema", () => {
  it("parses an add-only body (no removeId key)", () => {
    const r = ApplySwapSchema.safeParse({ assessmentId: ASSESSMENT_ID, addId: ADD_ID });
    expect(r.success).toBe(true);
  });
  it("parses an add-only body with removeId explicitly null", () => {
    const r = ApplySwapSchema.safeParse({
      assessmentId: ASSESSMENT_ID,
      removeId: null,
      addId: ADD_ID,
    });
    expect(r.success).toBe(true);
  });
  it("still parses a full swap body", () => {
    const r = ApplySwapSchema.safeParse({
      assessmentId: ASSESSMENT_ID,
      removeId: REMOVE_ID,
      addId: ADD_ID,
    });
    expect(r.success).toBe(true);
  });
  it("rejects a body missing addId", () => {
    const r = ApplySwapSchema.safeParse({ assessmentId: ASSESSMENT_ID, removeId: REMOVE_ID });
    expect(r.success).toBe(false);
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

describe("OnboardingDecisionSchema", () => {
  it("accepterar ett beslut med redigering", () => {
    expect(
      OnboardingDecisionSchema.safeParse({
        source: 1, shapeIndex: 0, decision: "confirmed",
        token: "{Metod}", intent: "Metodbeskrivning",
      }).success,
    ).toBe(true);
  });
  it("avvisar okänt decision-värde och negativ shapeIndex", () => {
    expect(OnboardingDecisionSchema.safeParse({ source: 1, shapeIndex: 0, decision: "maybe" }).success).toBe(false);
    expect(OnboardingDecisionSchema.safeParse({ source: 1, shapeIndex: -1, decision: "skipped" }).success).toBe(false);
  });
});
