import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TemplateSection } from "../TemplateSection";
import type { TemplateRow } from "@/app/installningar/page";
import type { TemplateManifest } from "@/lib/pptx-template/manifest-types";

// next/navigation's useRouter is unavailable outside the App Router runtime.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const manifest: TemplateManifest = {
  manifestVersion: 1,
  name: "anbudsmall-v2",
  slides: [
    { source: 1, type: "cover", placeholders: ["{Bolagsnamn}", "{Kundnamn}"] },
    {
      source: 3,
      type: "prose",
      variant: "kunden-idag",
      placeholders: ["{Nuläge}"],
      imageShapes: { placed: 1, placeholders: 2 },
    },
  ],
  budgets: { "phases[*].name": 40 },
  fieldSlides: { "phases[*].name": 6 },
  excludedSlides: [{ source: 8, reason: "duplikat av slide 7" }],
};

const templates: TemplateRow[] = [
  { id: "11111111-1111-1111-1111-111111111111", name: "anbudsmall-v2", version: 2, manifest, created_at: "2026-06-10T00:00:00Z" },
  { id: "22222222-2222-2222-2222-222222222222", name: "anbudsmall-v2", version: 1, manifest, created_at: "2026-06-01T00:00:00Z" },
];

describe("TemplateSection", () => {
  it("renders the template list", () => {
    render(<TemplateSection templates={templates} activeTemplateId={null} />);
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
  });

  it("shows the 'Aktiv' badge on the active row and 'Aktivera' on others", () => {
    render(
      <TemplateSection templates={templates} activeTemplateId="11111111-1111-1111-1111-111111111111" />
    );
    expect(screen.getByText("Aktiv")).toBeInTheDocument();
    // Only the non-active row gets an activate button.
    expect(screen.getAllByRole("button", { name: /Aktivera/ })).toHaveLength(1);
  });

  it("renders the empty state when there are no templates", () => {
    render(<TemplateSection templates={[]} activeTemplateId={null} />);
    expect(screen.getByText("Inga mallar ännu.")).toBeInTheDocument();
  });

  it("renders the upload preview from the API response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "33333333-3333-3333-3333-333333333333",
        name: "ny-mall",
        version: 1,
        manifest,
        warnings: ["sliden saknar diarienummer"],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TemplateSection templates={templates} activeTemplateId={null} />);

    const input = document.getElementById("template-upload") as HTMLInputElement;
    const file = new File(["x"], "ny-mall.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(screen.getByText(/Förhandsgranskning: ny-mall v1/)).toBeInTheDocument()
    );
    // Per-slide variant + image-shape note + excluded slide + budget + warning.
    expect(screen.getByText(/kunden-idag/)).toBeInTheDocument();
    expect(
      screen.getByText(/Bilder lämnas orörda/)
    ).toBeInTheDocument();
    expect(screen.getByText(/duplikat av slide 7/)).toBeInTheDocument();
    // Budgetar visas nu med läsbar etikett, inte rå fältväg.
    expect(screen.getByText("Fas – Namn")).toBeInTheDocument();
    expect(screen.queryByText("phases[*].name")).not.toBeInTheDocument();
    expect(screen.getByText(/sliden saknar diarienummer/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Aktivera den här mallen/ })
    ).toBeInTheDocument();
  });

  it("varnar för trånga fält men tillåter aktivering (varna + tillåt)", async () => {
    // objective: tak 120, budget 60 < 0.9*120 => trångt. name 40 = tak => ej trångt.
    const tightManifest: TemplateManifest = {
      ...manifest,
      budgets: { "phases[*].name": 40, "phases[*].objective": 60 },
      fieldSlides: { "phases[*].name": 6, "phases[*].objective": 7 },
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "44444444-4444-4444-4444-444444444444",
        name: "trång-mall",
        version: 1,
        manifest: tightManifest,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TemplateSection templates={templates} activeTemplateId={null} />);
    const input = document.getElementById("template-upload") as HTMLInputElement;
    const file = new File(["x"], "trång-mall.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(screen.getByText(/Förhandsgranskning: trång-mall/)).toBeInTheDocument()
    );
    // Varning finns och namnger det trånga fältet med budget + normalt tak.
    expect(screen.getByText(/tvingar kortare text/)).toBeInTheDocument();
    expect(
      screen.getByText(/Fas – Mål — mallen rymmer 60 tecken \(normalt 120\)/)
    ).toBeInTheDocument();
    // Aktivering är fortfarande tillåten (ingen hård blockering).
    expect(
      screen.getByRole("button", { name: /Aktivera den här mallen/ })
    ).not.toBeDisabled();
  });

  it("visar ingen trång-varning när alla fält ryms", async () => {
    // Bara name 40/40 => inget fält trångt.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "55555555-5555-5555-5555-555555555555",
        name: "rymlig-mall",
        version: 1,
        manifest,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TemplateSection templates={templates} activeTemplateId={null} />);
    const input = document.getElementById("template-upload") as HTMLInputElement;
    const file = new File(["x"], "rymlig-mall.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(screen.getByText(/Förhandsgranskning: rymlig-mall/)).toBeInTheDocument()
    );
    expect(screen.queryByText(/tvingar kortare text/i)).not.toBeInTheDocument();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});
