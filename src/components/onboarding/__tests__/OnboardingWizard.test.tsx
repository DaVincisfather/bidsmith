import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { OnboardingWizard } from "../OnboardingWizard";
import type { OnboardingDraft } from "@/lib/pptx-template/onboarding/draft";

// GET-svaret mockas per test — inga live-anrop; följer TemplateSection-mönstret.
function mockGet(payload: Record<string, unknown>) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const draft: OnboardingDraft = {
  draftVersion: 1,
  slideSize: { cx: 12192000, cy: 6858000 },
  slots: [
    {
      source: 2, shapeIndex: 1, shapeText: "Beskriv er metod",
      token: "{Metod}", capability: "understanding", intent: "Metodbeskrivning",
      confidence: "high", decision: "pending",
    },
  ],
  wireframe: [
    {
      source: 2,
      shapes: [
        { shapeIndex: 1, geometry: { x: 0, y: 0, cx: 1000, cy: 1000 }, text: "Beskriv er metod", candidate: true },
      ],
    },
  ],
};

describe("OnboardingWizard", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("needs_onboarding: visar start-knapp och precount", async () => {
    mockGet({ status: "needs_onboarding", name: "kundmall", version: 1, draft: null, precount: { slides: 5, candidates: 12 } });
    render(<OnboardingWizard templateId="t-1" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /starta klassificering/i })).toBeInTheDocument(),
    );
    expect(screen.getByText(/12 textrutor att/)).toBeInTheDocument();
  });

  it("classifying: visar pågår-status", async () => {
    mockGet({ status: "classifying", name: "kundmall", version: 1, draft: null });
    render(<OnboardingWizard templateId="t-1" />);
    await waitFor(() =>
      expect(screen.getByText(/klassificerar textrutor/i)).toBeInTheDocument(),
    );
  });

  it("draft: renderar wireframe + slot-panel för första slide", async () => {
    mockGet({ status: "draft", name: "kundmall", version: 1, draft });
    render(<OnboardingWizard templateId="t-1" />);
    await waitFor(() => expect(screen.getByLabelText(/tokennamn/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /^slide 2$/i })).toBeInTheDocument();
  });

  it("onboarded: visar klar-vy med länk till inställningar", async () => {
    mockGet({ status: "onboarded", name: "kundmall", version: 1, draft: null });
    render(<OnboardingWizard templateId="t-1" />);
    await waitFor(() =>
      expect(screen.getByText(/onboardad och körbar/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: /inställningar/i })).toHaveAttribute("href", "/installningar");
  });

  it("fetch-reject vid mount: visar uiError i st.f. att fastna tyst på Laddar", async () => {
    // Utan try/catch runt refresh blir detta en unhandled rejection och uiError
    // sätts aldrig — användaren tror att sidan bara laddar (I4).
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("network down"));
    vi.stubGlobal("fetch", fetchMock);
    render(<OnboardingWizard templateId="t-1" />);
    await waitFor(() =>
      expect(screen.getByText(/nätverksfel/i)).toBeInTheDocument(),
    );
  });

  it("draft utan utkast: visar felsträngen + väg tillbaka", async () => {
    mockGet({ status: "draft", name: "kundmall", version: 1, draft: null, error: "utkastet är korrupt — kör om klassificeringen" });
    render(<OnboardingWizard templateId="t-1" />);
    await waitFor(() =>
      expect(screen.getByText(/utkastet är korrupt/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /kör om klassificeringen/i })).toBeInTheDocument();
  });
});
