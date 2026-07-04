import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConsultantProfile } from "../consultant-profile";

// next/navigation's useRouter är otillgänglig utanför App Router-runtimen.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// Källvyn hämtar sin endpoint vid öppning — mocka fetch (ingen live-anrop).
beforeEach(() => {
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({ sourceText: "", spans: { merged: [], perEvidence: [] } }),
    }),
  ) as never;
});

type Consultant = Parameters<typeof ConsultantProfile>[0]["consultant"];

function makeConsultant(overrides: Partial<Consultant>): Consultant {
  return {
    id: "c1",
    name: "Anna Andersson",
    level: "senior",
    years_experience: 8,
    summary: "Erfaren konsult",
    consultant_competencies: [],
    consultant_references: [],
    ...overrides,
  };
}

describe("ConsultantProfile — källa-badge", () => {
  it("gör en belagd kompetens klickbar och togglar citatet (ett i taget)", () => {
    render(
      <ConsultantProfile
        consultant={makeConsultant({
          consultant_competencies: [
            { id: "k1", competency: "Projektledning", category: "methodology", evidence: "Ledde tre stora projekt" },
          ],
        })}
      />,
    );

    // Belagd kompetens är klickbar och öppnar källvyn (slide-over) i stället för
    // att fälla ut citatet inline.
    const chip = screen.getByRole("button", { name: /Projektledning/ });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(chip);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("flaggad kompetens (utan evidens) är inte klickbar", () => {
    render(
      <ConsultantProfile
        consultant={makeConsultant({
          consultant_competencies: [
            { id: "k1", competency: "Belagd", category: "technical", evidence: "Citat" },
            { id: "k2", competency: "Obelagd", category: "technical", evidence: undefined },
          ],
        })}
      />,
    );

    // Belagd är en knapp, obelagd är det inte.
    expect(screen.getByRole("button", { name: /Belagd/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Obelagd/ })).not.toBeInTheDocument();
  });

  it("källa-chip på referens med evidens togglar citatet", () => {
    render(
      <ConsultantProfile
        consultant={makeConsultant({
          consultant_references: [
            { id: "r1", title: "Uppdrag X", description: "Beskrivning", year: 2024, sector: "public", evidence: "Referenscitat ur CV" },
          ],
        })}
      />,
    );

    const chip = screen.getByRole("button", { name: /källa/i });
    fireEvent.click(chip);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("legacy-grind (extraction_version null): inga dots/chips när varken kompetens eller referens bär evidens", () => {
    render(
      <ConsultantProfile
        consultant={makeConsultant({
          consultant_competencies: [
            { id: "k1", competency: "Gammal kompetens", category: "technical" },
          ],
          consultant_references: [
            { id: "r1", title: "Gammalt uppdrag", description: "Beskrivning", year: 2020, sector: "private" },
          ],
        })}
      />,
    );

    expect(screen.queryByRole("button", { name: /källa/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/obelagd/i)).not.toBeInTheDocument();
    // Kompetens-chippen renderas fortfarande som ren text (ingen knapp).
    expect(screen.queryByRole("button", { name: /Gammal kompetens/ })).not.toBeInTheDocument();
  });

  it("versions-diskriminator (migration 011): all-strippad post-feature-rad VISAR amber-flaggor i st.f. att dölja badges", () => {
    render(
      <ConsultantProfile
        consultant={makeConsultant({
          // Post-feature: extraction_version satt, men vakten strippade all evidens
          // (degenererat underlag). Grinden är då alltid på ⇒ all-amber, inte gömt.
          extraction_version: 1,
          consultant_competencies: [
            { id: "k1", competency: "Fabricerad", category: "technical" },
          ],
          consultant_references: [
            { id: "r1", title: "Obelagt uppdrag", description: "Beskrivning", year: 2024, sector: "public" },
          ],
        })}
      />,
    );

    // Kompetensen visar obelagd-dot (sr-only "(obelagd)"); referensen visar FlaggedPill ("obelagd").
    expect(screen.getByText("(obelagd)")).toBeInTheDocument();
    expect(screen.getByText("obelagd")).toBeInTheDocument();
    // Fortfarande inte klickbar — inget citat att visa.
    expect(screen.queryByRole("button", { name: /Fabricerad/ })).not.toBeInTheDocument();
  });
});
