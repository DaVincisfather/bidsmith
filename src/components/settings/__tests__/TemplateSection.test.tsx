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
    expect(screen.getByText("phases[*].name")).toBeInTheDocument();
    expect(screen.getByText(/sliden saknar diarienummer/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Aktivera den här mallen/ })
    ).toBeInTheDocument();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});
