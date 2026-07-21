import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { OutcomeSheet } from "../OutcomeSheet";
import type { BidSummary } from "@/lib/types";

const bid: BidSummary = {
  id: "bid-1",
  title: "Testanbud",
  exportedAt: "2026-07-20T10:00:00Z",
  teamNames: ["Anna"],
  outcome: null,
} as BidSummary;

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true })) as never);
});

describe("OutcomeSheet", () => {
  it("shows the enrichment form after committing and does NOT refetch the parent yet", async () => {
    const onCommitted = vi.fn();
    render(<OutcomeSheet awaiting={[bid]} onClose={() => {}} onCommitted={onCommitted} />);

    fireEvent.click(screen.getByRole("button", { name: "Förlorad" }));

    // The reason form must be reachable: parent refetch (which drops the bid
    // out of `awaiting` and unmounts this row) may only happen after the
    // enrichment step is saved or skipped.
    await waitFor(() => expect(screen.getByText(/Valfria detaljer/)).toBeTruthy());
    expect(screen.getByText(/Varför förlorade vi/)).toBeTruthy();
    expect(onCommitted).not.toHaveBeenCalled();
  });

  it("refetches the parent when the enrichment step is skipped", async () => {
    const onCommitted = vi.fn();
    render(<OutcomeSheet awaiting={[bid]} onClose={() => {}} onCommitted={onCommitted} />);

    fireEvent.click(screen.getByRole("button", { name: "Vunnen" }));
    await waitFor(() => expect(screen.getByText(/Valfria detaljer/)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Hoppa över/ }));
    await waitFor(() => expect(onCommitted).toHaveBeenCalledTimes(1));
  });

  it("refetches the parent after the enrichment details are saved", async () => {
    const onCommitted = vi.fn();
    render(<OutcomeSheet awaiting={[bid]} onClose={() => {}} onCommitted={onCommitted} />);

    fireEvent.click(screen.getByRole("button", { name: "Förlorad" }));
    await waitFor(() => expect(screen.getByText(/Valfria detaljer/)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Spara/ }));
    await waitFor(() => expect(onCommitted).toHaveBeenCalledTimes(1));
  });
});
