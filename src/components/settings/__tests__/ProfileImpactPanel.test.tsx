import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProfileImpactPanel } from "../ProfileImpactPanel";

describe("ProfileImpactPanel", () => {
  it("listar sektionerna profilen används i och förklarar tomma fält", () => {
    render(<ProfileImpactPanel activeProfile={null} />);
    expect(screen.getByText("Kravmatris")).toBeInTheDocument();
    expect(screen.getByText("Team")).toBeInTheDocument();
    expect(screen.getByText(/mer generisk/)).toBeInTheDocument();
  });

  it("visar '0 av 3' och aktiverings-hint när ingen profil är aktiv", () => {
    render(<ProfileImpactPanel activeProfile={null} />);
    expect(screen.getByText(/0 av 3 fält/)).toBeInTheDocument();
    expect(screen.getByText(/Ingen profil är aktiv ännu/)).toBeInTheDocument();
  });

  it("räknar ifyllda fält för den aktiva profilen", () => {
    render(
      <ProfileImpactPanel
        activeProfile={{ companyName: "Ekan AB", tonality: "Rak", boilerplate: null }}
      />
    );
    expect(screen.getByText(/2 av 3 fält/)).toBeInTheDocument();
    // Ingen aktiverings-hint när en profil är aktiv.
    expect(screen.queryByText(/Ingen profil är aktiv ännu/)).toBeNull();
  });
});
