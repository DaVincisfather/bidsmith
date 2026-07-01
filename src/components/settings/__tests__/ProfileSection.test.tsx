import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProfileSection } from "../ProfileSection";
import type { ProfileRow } from "@/app/installningar/page";

// next/navigation's useRouter is unavailable outside the App Router runtime.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const profiles: ProfileRow[] = [
  { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", company_name: "Ekan AB", tonality: "Rak", boilerplate: null },
  { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", company_name: "Testbolaget", tonality: null, boilerplate: null },
];

describe("ProfileSection", () => {
  it("renders the profile list", () => {
    render(
      <ProfileSection profiles={profiles} activeProfileId={null} migration005Missing={false} />
    );
    expect(screen.getByText("Ekan AB")).toBeInTheDocument();
    expect(screen.getByText("Testbolaget")).toBeInTheDocument();
  });

  it("shows the 'Aktiv' badge on the active row and 'Aktivera' on others", () => {
    render(
      <ProfileSection
        profiles={profiles}
        activeProfileId="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
        migration005Missing={false}
      />
    );
    expect(screen.getByText("Aktiv")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Aktivera/ })).toHaveLength(1);
  });

  it("renders the create form with all three fields", () => {
    render(
      <ProfileSection profiles={[]} activeProfileId={null} migration005Missing={false} />
    );
    expect(screen.getByLabelText("Företagsnamn")).toBeInTheDocument();
    expect(screen.getByLabelText("Tonalitet")).toBeInTheDocument();
    expect(screen.getByLabelText("Boilerplate")).toBeInTheDocument();
    expect(screen.getByText("Inga profiler ännu. Skapa en nedan.")).toBeInTheDocument();
  });

  it("shows the migration-005 hint and disables the form when the table is missing", () => {
    render(
      <ProfileSection profiles={[]} activeProfileId={null} migration005Missing />
    );
    expect(screen.getByText(/applicera migration 005/)).toBeInTheDocument();
    expect(screen.getByLabelText("Företagsnamn")).toBeDisabled();
    expect(screen.getByRole("button", { name: /Skapa profil/ })).toBeDisabled();
  });
});
