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
  const okThenable = (label: string) => {
    ops.push(label);
    return Promise.resolve({ data: null, error: null });
  };
  const client = {
    from(table: string) {
      return {
        select: () => ({
          // consultants-uppslag på namn
          ilike: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }),
        }),
        update: () => ({ eq: () => okThenable(`${table}.update`) }),
        delete: () => ({ eq: () => okThenable(`${table}.delete`) }),
        insert: (_rows: unknown) => {
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
  };
  return client as unknown as SupabaseClient & { _ops: string[] };
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
});
