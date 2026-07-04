import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConsultantList } from "../consultant-list";

// Dot-grinden på LIST-ytan (#59 gav dots bara på [id]-profilen). Per-konsult legacy-
// grind: bär ingen kompetens evidens visas inga dots. sr-only bär belagd/obelagd.

function row(
  competencies: Array<{ competency: string; category: string; hasEvidence?: boolean }>,
  extraction_version?: number | null,
) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Anna Andersson",
    level: "senior",
    years_experience: 8,
    summary: null,
    extraction_version,
    consultant_competencies: competencies,
  };
}

describe("ConsultantList — dot-badges på kompetens-chippen", () => {
  it("visar belagd- och obelagd-dot (sr-only) när minst en kompetens bär evidens", () => {
    render(
      <ConsultantList
        initialData={[
          row([
            { competency: "Upphandling", category: "domain", hasEvidence: true },
            { competency: "Ledarskap", category: "methodology" },
          ]),
        ]}
      />,
    );
    expect(screen.getByText("(belagd i CV)")).toBeInTheDocument();
    expect(screen.getByText("(obelagd)")).toBeInTheDocument();
    // Chippens text finns kvar oförändrad.
    expect(screen.getByText("Upphandling")).toBeInTheDocument();
    expect(screen.getByText("Ledarskap")).toBeInTheDocument();
  });

  it("visar INGA dots när ingen kompetens bär evidens OCH ingen version (äkta legacy)", () => {
    render(
      <ConsultantList
        initialData={[
          row([
            { competency: "Upphandling", category: "domain" },
            { competency: "Ledarskap", category: "methodology" },
          ]),
        ]}
      />,
    );
    expect(screen.queryByText("(belagd i CV)")).not.toBeInTheDocument();
    expect(screen.queryByText("(obelagd)")).not.toBeInTheDocument();
    expect(screen.getByText("Upphandling")).toBeInTheDocument();
  });

  it("versions-diskriminator (011): all-strippad post-feature-rad visar amber-dots (ej gömda)", () => {
    render(
      <ConsultantList
        initialData={[
          row(
            [
              { competency: "Fabricerad", category: "domain" },
              { competency: "Obelagd", category: "methodology" },
            ],
            1,
          ),
        ]}
      />,
    );
    // Grinden är på trots noll evidens ⇒ obelagd-dot visas.
    expect(screen.getAllByText("(obelagd)").length).toBeGreaterThan(0);
    expect(screen.queryByText("(belagd i CV)")).not.toBeInTheDocument();
    expect(screen.getByText("Fabricerad")).toBeInTheDocument();
  });
});
