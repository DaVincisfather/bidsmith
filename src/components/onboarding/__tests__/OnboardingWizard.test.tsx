import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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

  it("needs_onboarding: visar både felet OCH precount-raden vid retry efter klassificeringsfel", async () => {
    // Fynd #2: klassificeringsfelet fick tidigare skriva över precount — den
    // ska bevaras med och renderas oberoende av felmeddelandet.
    mockGet({
      status: "needs_onboarding", name: "kundmall", version: 1, draft: null,
      error: "klassificeringen kraschade", precount: { slides: 5, candidates: 12 },
    });
    render(<OnboardingWizard templateId="t-1" />);
    await waitFor(() =>
      expect(screen.getByText(/klassificeringen kraschade/i)).toBeInTheDocument(),
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

  it("draft: listar screen-fynd för sliden märkta som preliminära", async () => {
    const draftWithScreen: OnboardingDraft = {
      ...draft,
      screen: [{ slide: 2, shape: "3", kind: "tight-box", detail: "kapacitet 12 tecken < 20" }],
    };
    mockGet({ status: "draft", name: "kundmall", version: 1, draft: draftWithScreen });
    render(<OnboardingWizard templateId="t-1" />);
    await waitFor(() => expect(screen.getByText(/preliminär geometri-bedömning/i)).toBeInTheDocument());
    expect(screen.getByText(/kapacitet 12 tecken < 20/)).toBeInTheDocument();
  });

  it("onboarded utan measurement: visar mätsteget med kommandot", async () => {
    mockGet({ status: "onboarded", name: "kundmall", version: 1, draft: null, measurement: null });
    render(<OnboardingWizard templateId="t-1" />);
    await waitFor(() =>
      expect(screen.getByText(/mallen behöver mätas lokalt/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/npm run onboarding:measure -- t-1 --write/)).toBeInTheDocument();
  });

  it("onboarded med measurement: visar hälsorapport med länk till inställningar", async () => {
    mockGet({
      status: "onboarded", name: "kundmall", version: 1, draft: null,
      measurement: { status: "complete", measuredAt: "2026-07-19T10:00:00Z", calibrationRounds: 1, unresolved: [], slotWarnings: {} },
      knownDefects: [],
    });
    render(<OnboardingWizard templateId="t-1" />);
    await waitFor(() =>
      expect(screen.getByText(/hälsorapport/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/klar för aktivering/i)).toBeInTheDocument();
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

  it("fast slide-knappen bulk-skippar slidens rutor och visar ångra-läget", async () => {
    const skippedDraft: OnboardingDraft = {
      ...draft,
      slots: draft.slots.map((s) => ({ ...s, decision: "skipped" as const })),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: "draft", name: "kundmall", version: 1, draft }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ draft: skippedDraft }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<OnboardingWizard templateId="t-1" />);
    const btn = await screen.findByRole("button", { name: /markera hela sliden som fast/i });
    fireEvent.click(btn);

    await waitFor(() =>
      expect(screen.getByText(/sliden är markerad som fast/i)).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/templates/t-1/onboarding",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ slide: 2, decision: "skipped" }),
      }),
    );
    expect(screen.getByRole("button", { name: /ångra/i })).toBeInTheDocument();
  });
});
