import { describe, it, expect } from "vitest";
import { groundedItems, groundedConsultantClaims } from "@/lib/grounded-claims";

type Item = { evidence?: string | null; name: string };

describe("groundedItems", () => {
  it("passes ALL items through for a legacy list (no post bears evidence)", () => {
    const items: Item[] = [
      { name: "a", evidence: null },
      { name: "b" },
      { name: "c", evidence: "" },
    ];
    expect(groundedItems(items).map((i) => i.name)).toEqual(["a", "b", "c"]);
  });

  it("drops flagged items when the list bears any evidence (post-feature)", () => {
    const items: Item[] = [
      { name: "grundad", evidence: "ordagrant citat" },
      { name: "flaggad", evidence: null },
      { name: "tom", evidence: "   " },
    ];
    expect(groundedItems(items).map((i) => i.name)).toEqual(["grundad"]);
  });
});

describe("groundedConsultantClaims", () => {
  it("legacy consultant (no evidence anywhere): passes competencies + references through", () => {
    const c: {
      competencies: { competency: string; evidence?: string | null }[];
      references: { title: string; evidence?: string | null }[];
    } = {
      competencies: [{ competency: "React", evidence: null }, { competency: "Node" }],
      references: [{ title: "Uppdrag A" }],
    };
    const out = groundedConsultantClaims(c);
    expect(out.competencies).toHaveLength(2);
    expect(out.references).toHaveLength(1);
  });

  it("mixed post-feature consultant: drops only the flagged competency", () => {
    const c = {
      competencies: [
        { competency: "React", evidence: "byggde React-app" },
        { competency: "Fabricerad", evidence: null },
      ],
      references: [{ title: "Uppdrag A", evidence: "ledde uppdrag A" }],
    };
    const out = groundedConsultantClaims(c);
    expect(out.competencies.map((i) => i.competency)).toEqual(["React"]);
    expect(out.references).toHaveLength(1);
  });

  it("union gate: evidence on competencies makes evidence-less references flagged (post-feature)", () => {
    // Konsulten bär evidens på EN kompetens ⇒ post-feature ⇒ referensen utan evidens
    // är flaggad över unionen, trots att referens-arrayen ensam saknar all evidens.
    const c = {
      competencies: [{ competency: "React", evidence: "byggde React-app" }],
      references: [{ title: "Obelagt uppdrag", evidence: null }],
    };
    const out = groundedConsultantClaims(c);
    expect(out.competencies).toHaveLength(1);
    expect(out.references).toHaveLength(0);
  });

  it("union gate: evidence only on references still flags evidence-less competencies", () => {
    const c = {
      competencies: [{ competency: "Obelagd", evidence: null }],
      references: [{ title: "Uppdrag A", evidence: "ledde uppdrag A" }],
    };
    const out = groundedConsultantClaims(c);
    expect(out.competencies).toHaveLength(0);
    expect(out.references).toHaveLength(1);
  });

  it("all-flagged residual: a post-feature consultant fully stripped is indistinguishable from legacy and passes through (documented residual, needs temporal/version discriminator)", () => {
    // Degenererat underlag (fel fil som CV): competencies.min(1) tvingar fram en
    // fabricerad-men-flaggad post, vaktens strip lämnar INGEN evidens. Unionen ser
    // inget ⇒ grinden kan inte skilja från äkta legacy ⇒ släpper igenom. Ärlig residual.
    const c = {
      competencies: [{ competency: "Fabricerad", evidence: null }],
      references: [] as { title: string; evidence?: string | null }[],
    };
    const out = groundedConsultantClaims(c);
    expect(out.competencies).toHaveLength(1);
  });
});
