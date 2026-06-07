import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StatsTable } from "../StatsTable";
import type { UserStats } from "@/lib/stats";

const user: UserStats = {
  userId: "user-aaaa1111",
  email: "stefan@example.se",
  costUsd: 10,
  bidsSubmitted: 2,
  wins: 1,
  losses: 1,
  winRate: 0.5,
  pending: [{ id: "b1", title: "RFP Alfa", status: "draft" }],
};

describe("StatsTable", () => {
  it("hides pending chips until the row is clicked, then links to the bid", () => {
    render(<StatsTable perUser={[user]} />);
    expect(screen.queryByText("RFP Alfa")).toBeNull();

    fireEvent.click(screen.getByText("stefan@example.se"));

    const link = screen.getByRole("link", { name: /RFP Alfa/ });
    expect(link).toHaveAttribute("href", "/bids/b1");
    expect(screen.getByText("Utkast")).toBeInTheDocument();
  });

  it("renders the empty-state when there are no users", () => {
    render(<StatsTable perUser={[]} />);
    expect(screen.getByText("Ingen data ännu.")).toBeInTheDocument();
  });
});
