import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SourceViewer } from "../source-viewer";

// Källtext med två markerade spann; "active" är det klickade citatet.
//   index:  0 A 1 A 2 _ 3 a c t i v e 9 _ 10 B B 12 _ 13 o t h e r 18 _ 19 C C
const SOURCE = "AA active BB other CC";
const VIEW_DATA = {
  sourceText: SOURCE,
  spans: {
    merged: [
      { start: 3, end: 9 },
      { start: 13, end: 18 },
    ],
    perEvidence: [
      { start: 3, end: 9, evidence: "active" },
      { start: 13, end: 18, evidence: "other" },
    ],
  },
};

function mockFetch(data: unknown, ok = true) {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok, json: () => Promise.resolve(data) }),
  ) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("SourceViewer", () => {
  it("renderar ingenting när open=false och hämtar inte", () => {
    mockFetch(VIEW_DATA);
    const { container } = render(
      <SourceViewer open={false} url="/x" quote="active" onClose={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("öppnar som dialog, hämtar källan och markerar det aktiva citatet starkare", async () => {
    mockFetch(VIEW_DATA);
    render(
      <SourceViewer
        open
        url="/api/analyses/x/source-view"
        quote="active"
        title="Upphandling.pdf"
        onClose={() => {}}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Upphandling.pdf")).toBeInTheDocument();

    // Aktivt citat: <mark> med ring-betoning. Övrigt spann: bara bg-accent-soft.
    const active = await screen.findByText("active");
    expect(active.tagName).toBe("MARK");
    expect(active.className).toContain("ring-accent");

    const other = screen.getByText("other");
    expect(other.tagName).toBe("MARK");
    expect(other.className).not.toContain("ring-accent");
    expect(other.className).toContain("bg-accent-soft");
  });

  it("visar 'Öppna originalet' när fileUrl finns", async () => {
    mockFetch({ ...VIEW_DATA, fileUrl: "https://signed/doc.pdf" });
    render(<SourceViewer open url="/x" quote="active" onClose={() => {}} />);
    const link = await screen.findByRole("link", { name: /öppna originalet/i });
    expect(link).toHaveAttribute("href", "https://signed/doc.pdf");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("Escape stänger (onClose anropas)", async () => {
    mockFetch(VIEW_DATA);
    const onClose = vi.fn();
    render(<SourceViewer open url="/x" quote="active" onClose={onClose} />);
    await screen.findByText("active");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stäng-knappen anropar onClose och har aria-label", async () => {
    mockFetch(VIEW_DATA);
    const onClose = vi.fn();
    render(<SourceViewer open url="/x" quote="active" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /stäng källvyn/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("felstadie: visar det klickade citatet som fallback när hämtningen fallerar", async () => {
    mockFetch(null, false);
    render(<SourceViewer open url="/x" quote="Det klickade citatet" onClose={() => {}} />);
    expect(
      await screen.findByText(/Kunde inte ladda källdokumentet/),
    ).toBeInTheDocument();
    // SourceQuote-fallback omsluter citatet med svenska citationstecken.
    expect(screen.getByText(/”Det klickade citatet”/)).toBeInTheDocument();
  });
});
