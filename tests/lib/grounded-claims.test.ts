import { describe, it, expect } from "vitest";
import { groundedConsultantClaims } from "@/lib/grounded-claims";

type Item = { evidence?: string | null; name: string };

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

  it("all-flagged WITHOUT version (legacy): fully stripped is indistinguishable from legacy and passes through (union heuristic — the pre-011 residual)", () => {
    // Utan versionsdata (extractionVersion utelämnad ⇒ behandlas som null/legacy):
    // degenererat underlag (fel fil som CV) med all evidens strippad är oskiljbart från
    // äkta legacy ⇒ unionen ser inget ⇒ passthrough. Detta är residualen migration 011 stänger.
    const c = {
      competencies: [{ competency: "Fabricerad", evidence: null }],
      references: [] as { title: string; evidence?: string | null }[],
    };
    const out = groundedConsultantClaims(c);
    expect(out.competencies).toHaveLength(1);
  });

  // --- Versions-medveten grind (migration 011): extractionVersion stänger residualen ---
  describe("extractionVersion-medveten grind", () => {
    it("version 1 + ingen evidens: ALLA claims flaggas bort (all-strippad ≠ legacy)", () => {
      // Exakt det degenererade fallet ovan, men nu med en post-feature-version: grinden
      // är alltid på ⇒ den fabricerade-men-flaggade posten faller ⇒ noll grundade claims.
      const c = {
        competencies: [{ competency: "Fabricerad", evidence: null }],
        references: [{ title: "Obelagt", evidence: null }],
      };
      const out = groundedConsultantClaims(c, 1);
      expect(out.competencies).toHaveLength(0);
      expect(out.references).toHaveLength(0);
    });

    it("version 1 + blandat: filtrerar bort bara de obelagda", () => {
      const c = {
        competencies: [
          { competency: "React", evidence: "byggde React-app" },
          { competency: "Fabricerad", evidence: null },
        ],
        references: [{ title: "Uppdrag A", evidence: "ledde uppdrag A" }],
      };
      const out = groundedConsultantClaims(c, 1);
      expect(out.competencies.map((i) => i.competency)).toEqual(["React"]);
      expect(out.references).toHaveLength(1);
    });

    it("null + ingen evidens: passthrough (äkta legacy, union-heuristiken)", () => {
      const c = {
        competencies: [{ competency: "Gammal", evidence: null }],
        references: [{ title: "Gammalt uppdrag", evidence: null }],
      };
      const out = groundedConsultantClaims(c, null);
      expect(out.competencies).toHaveLength(1);
      expect(out.references).toHaveLength(1);
    });

    it("null + blandat: filtrerar per union-heuristiken (evidens någonstans ⇒ grind på)", () => {
      const c = {
        competencies: [
          { competency: "React", evidence: "byggde React-app" },
          { competency: "Fabricerad", evidence: null },
        ],
        references: [{ title: "Obelagt", evidence: null }],
      };
      const out = groundedConsultantClaims(c, null);
      expect(out.competencies.map((i) => i.competency)).toEqual(["React"]);
      expect(out.references).toHaveLength(0);
    });
  });
});
