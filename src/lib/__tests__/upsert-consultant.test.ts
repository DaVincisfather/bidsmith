import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConsultantExtraction } from "@/lib/types";
import { upsertConsultant } from "@/lib/supabase";

const extraction: ConsultantExtraction = {
  name: "Anna Svensson",
  level: "senior",
  yearsExperience: 10,
  summary: "Lead",
  competencies: [{ competency: "Projektledning", category: "methodology" }],
  references: [{ title: "Ref", description: "d", year: 2024, sector: "public" }],
};

// Registrerande stub som matchar exakt de fluent-anrop upsertConsultant gör, och
// loggar vilka tabell-operationer som körs så vi kan skilja update- från insert-vägen.
function makeStub(existing: { id: string } | null) {
  const ops: string[] = [];
  const inserted: Record<string, unknown[]> = {};
  const okThenable = (label: string) => {
    ops.push(label);
    return Promise.resolve({ data: null, error: null });
  };
  const client = {
    from(table: string) {
      return {
        select: () => ({
          // consultants-uppslag på namn: .ilike().order().limit().maybeSingle()
          ilike: () => ({
            order: () => ({
              limit: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }),
            }),
          }),
        }),
        update: () => ({ eq: () => okThenable(`${table}.update`) }),
        delete: () => ({ eq: () => okThenable(`${table}.delete`) }),
        insert: (rows: unknown) => {
          (inserted[table] ??= []).push(...(Array.isArray(rows) ? rows : [rows]));
          const p = okThenable(`${table}.insert`);
          return Object.assign(p, {
            select: () => ({
              single: async () => ({ data: { id: "new-id" }, error: null }),
            }),
          });
        },
      };
    },
    _ops: ops,
    _inserted: inserted,
  };
  return client as unknown as SupabaseClient & {
    _ops: string[];
    _inserted: Record<string, unknown[]>;
  };
}

describe("upsertConsultant", () => {
  it("uppdaterar befintlig konsult (matchad på namn) och ersätter barn — ingen dubblett", async () => {
    const stub = makeStub({ id: "existing-1" });
    const res = await upsertConsultant(stub, extraction, "cv-text");
    expect(res).toEqual({ consultantId: "existing-1", updated: true });
    expect(stub._ops).toContain("consultants.update");
    expect(stub._ops).not.toContain("consultants.insert"); // ingen ny konsultrad
    expect(stub._ops).toContain("consultant_competencies.delete");
    expect(stub._ops).toContain("consultant_references.delete");
    expect(stub._ops).toContain("consultant_competencies.insert");
  });

  it("infogar ny konsult när ingen matchar namnet", async () => {
    const stub = makeStub(null);
    const res = await upsertConsultant(stub, extraction, "cv-text");
    expect(res).toEqual({ consultantId: "new-id", updated: false });
    expect(stub._ops).toContain("consultants.insert");
    expect(stub._ops).not.toContain("consultants.update");
  });

  it("persisterar vaktens evidence — verifierat citat som text, flaggad post som null (migration 009)", async () => {
    const stub = makeStub(null);
    const withEvidence: ConsultantExtraction = {
      ...extraction,
      competencies: [
        { competency: "Projektledning", category: "methodology", evidence: "ledde projekt inom offentlig sektor" },
        { competency: "React", category: "technical" }, // flaggad av vakten → evidence saknas
      ],
      references: [
        { title: "Ref", description: "d", year: 2024, sector: "public", evidence: "genomförde uppdraget Ref åt kommunen" },
      ],
    };
    await upsertConsultant(stub, withEvidence, "cv-text");

    expect(stub._inserted.consultant_competencies).toEqual([
      expect.objectContaining({ competency: "Projektledning", evidence: "ledde projekt inom offentlig sektor" }),
      expect.objectContaining({ competency: "React", evidence: null }),
    ]);
    expect(stub._inserted.consultant_references).toEqual([
      expect.objectContaining({ title: "Ref", evidence: "genomförde uppdraget Ref åt kommunen" }),
    ]);
  });
});
