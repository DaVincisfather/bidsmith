import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PipelineRail } from "../PipelineRail";
import type { BidSummary, PipelineItem } from "@/lib/types";

const activeItem: PipelineItem = {
  id: "rfp-1",
  source: "upload",
  title: "Aktiv upphandling",
  deadline: null,
  daysLeft: null,
  urgency: "later",
  relevanceScore: null,
  analysisId: "a-active",
  tedUrl: null,
};

function bid(
  id: string,
  analysisId: string | null,
  outcome: BidSummary["outcome"],
  exportedAt: string,
  outcomeLoggedAt: string | null = null,
): BidSummary {
  return {
    id,
    analysisId,
    title: `Anbud ${id}`,
    exportedAt,
    teamNames: [],
    outcome,
    outcomeLoggedAt,
    competitorName: null,
    lossReason: null,
    lossComment: null,
  };
}

const dashboardItems: BidSummary[] = [
  bid("wait-1", "a-1", null, "2026-08-10"),
  bid("dec-1", "a-2", "won", "2026-08-01", "2026-08-05"),
  bid("dec-2", "a-3", "lost", "2026-08-01", "2026-08-04"),
  bid("dec-3", "a-4", "lost", "2026-08-01", "2026-08-03"),
  bid("dec-4", "a-5", "cancelled", "2026-08-01", "2026-08-02"),
];

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (String(url).includes("/api/pipeline")) {
        return Promise.resolve({ json: async () => ({ items: [activeItem] }) });
      }
      return Promise.resolve({
        json: async () => ({
          items: dashboardItems,
          stats: { awaitingCount: 1, loggedCount: 4, wonCount: 1, lostCount: 2 },
        }),
      });
    }) as never,
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("PipelineRail (flikvarianten)", () => {
  it("Pågående-fliken är default: aktiva + väntande syns, avgjorda göms helt", async () => {
    render(<PipelineRail />);
    await waitFor(() => expect(screen.getByText("Aktiv upphandling")).toBeInTheDocument());

    expect(screen.getByRole("tab", { name: /Pågående\s?2/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: /Arkiv\s?4/ })).toBeInTheDocument();

    expect(screen.getByText("Anbud wait-1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Logga utfall/ })).toBeInTheDocument();
    // Hård separation: inga avgjorda i pågående-vyn.
    expect(screen.queryByText("Anbud dec-1")).not.toBeInTheDocument();
    expect(screen.queryByText("Anbud dec-4")).not.toBeInTheDocument();
  });

  it("Arkiv-fliken visar alla avgjorda som tysta rader och gömmer pågående", async () => {
    render(<PipelineRail />);
    await waitFor(() => expect(screen.getByText("Aktiv upphandling")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("tab", { name: /Arkiv\s?4/ }));

    expect(screen.queryByText("Aktiv upphandling")).not.toBeInTheDocument();
    expect(screen.queryByText("Anbud wait-1")).not.toBeInTheDocument();
    for (const id of ["dec-1", "dec-2", "dec-3", "dec-4"]) {
      expect(screen.getByText(`Anbud ${id}`)).toBeInTheDocument();
    }
    expect(screen.getByText(/Hela arkivet med utfall/)).toBeInTheDocument();
  });

  it("väntar-kortet har varken statuschip eller grå kantlist (anti-slop-justeringen)", async () => {
    render(<PipelineRail />);
    await waitFor(() => expect(screen.getByText("Anbud wait-1")).toBeInTheDocument());

    const card = screen.getByText("Anbud wait-1").closest("a")!;
    expect(card.textContent).not.toMatch(/Väntar beslut/i);
    // outerHTML fångar markören oavsett om den bor i style eller className
    // (routine-fynd #127: style-attributsasserten var alltid grön).
    expect(card.outerHTML).not.toContain("outcome-awaiting");
  });

  it("ärliga win-rate-foten räknar ur stats", async () => {
    render(<PipelineRail />);
    await waitFor(() => expect(screen.getByText(/Win-rate/)).toBeInTheDocument());
    // 1 W / 2 L => 33 %
    expect(screen.getByText("33 %")).toBeInTheDocument();
    expect(screen.getByText(/4 loggade utfall/)).toBeInTheDocument();
  });
});
