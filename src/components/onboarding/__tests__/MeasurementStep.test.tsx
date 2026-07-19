import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MeasurementStep } from "../MeasurementStep";

describe("MeasurementStep", () => {
  afterEach(() => vi.restoreAllMocks());

  it("visar kommandot med templateId interpolerat", () => {
    render(<MeasurementStep templateId="abc-123" />);
    expect(screen.getByText(/npm run onboarding:measure -- abc-123 --write/)).toBeInTheDocument();
  });

  it("kopiera-knappen skriver kommandot till urklipp och visar bekräftelse", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<MeasurementStep templateId="abc-123" />);
    fireEvent.click(screen.getByRole("button", { name: /kopiera/i }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("npm run onboarding:measure -- abc-123 --write"),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /kopierat/i })).toBeInTheDocument(),
    );
  });

  it("nämner att PowerPoint måste vara stängt under körningen", () => {
    render(<MeasurementStep templateId="abc-123" />);
    expect(screen.getByText(/powerpoint måste vara stängt/i)).toBeInTheDocument();
  });
});
