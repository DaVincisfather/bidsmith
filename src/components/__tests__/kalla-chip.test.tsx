import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KallaChip, FlaggedPill, SourceQuote, TrustReceipt } from "../kalla-chip";

describe("KallaChip", () => {
  it("renderar en källa-chip som anropar onShowSource med citatet vid klick", () => {
    const onShowSource = vi.fn();
    render(
      <KallaChip
        quote="Ordagrant citat ur RFP"
        label="Krav på erfarenhet"
        onShowSource={onShowSource}
      />,
    );
    const chip = screen.getByRole("button", { name: /visa källa/i });
    // Chippen fäller INTE ut inline längre — den öppnar källvyn via callbacken.
    expect(chip).not.toHaveAttribute("aria-expanded");
    expect(screen.queryByText(/Ordagrant citat ur RFP/)).not.toBeInTheDocument();

    fireEvent.click(chip);
    expect(onShowSource).toHaveBeenCalledTimes(1);
    expect(onShowSource).toHaveBeenCalledWith("Ordagrant citat ur RFP");
  });

  it("får ett unikt aria-label ur label-propen", () => {
    render(
      <KallaChip quote="x" label="Referens Alfa" onShowSource={() => {}} />,
    );
    expect(
      screen.getByRole("button", { name: "Visa källa: Referens Alfa" }),
    ).toBeInTheDocument();
  });
});

describe("FlaggedPill", () => {
  it("renderar 'obelagd' och är inte en knapp (ej klickbar)", () => {
    render(<FlaggedPill />);
    expect(screen.getByText(/obelagd/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("SourceQuote", () => {
  it("omsluter citatet med svenska citationstecken (källvyns fallback)", () => {
    render(<SourceQuote quote="Ett citat" />);
    expect(screen.getByText(/”Ett citat”/)).toBeInTheDocument();
  });
});

describe("TrustReceipt", () => {
  it("renderar inget när ingen post bär evidens (legacy-grinden)", () => {
    const { container } = render(
      <TrustReceipt items={[{ evidence: null }, { evidence: undefined }]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("räknar belagda av totalt utan obelagd-svans när alla är belagda", () => {
    render(
      <TrustReceipt
        items={[{ evidence: "a" }, { evidence: "b" }, { evidence: "c" }]}
      />,
    );
    expect(
      screen.getByText(/av 3 påståenden ordagrant belagda/),
    ).toBeInTheDocument();
    expect(screen.getByText(/mekaniskt verifierade, inte AI-bedömda/)).toBeInTheDocument();
    expect(screen.queryByText(/obelagda/)).not.toBeInTheDocument();
  });

  it("visar obelagd-svansen när Z > 0", () => {
    render(
      <TrustReceipt
        items={[{ evidence: "a" }, { evidence: null }, { evidence: "  " }]}
      />,
    );
    // 1 av 3 belagda, 2 obelagda (null + whitespace-only räknas som obelagt).
    expect(screen.getByText(/av 3 påståenden/)).toBeInTheDocument();
    expect(screen.getByText(/· 2 obelagda/)).toBeInTheDocument();
  });
});
