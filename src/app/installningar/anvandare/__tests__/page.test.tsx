import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import UsersPage from "../page";

beforeEach(() => vi.restoreAllMocks());

describe("UsersPage", () => {
  it("renders the invited users returned by the API", async () => {
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ users: [
          { id: "u1", email: "boss@firm.se", role: "admin", status: "active", invitedBy: null, createdAt: "t", updatedAt: "t" },
          { id: "u2", email: "kollega@firm.se", role: "member", status: "invited", invitedBy: "u1", createdAt: "t", updatedAt: "t" },
        ] }),
      }),
    ) as never);
    render(<UsersPage />);
    await waitFor(() => expect(screen.getByText("boss@firm.se")).toBeTruthy());
    expect(screen.getByText("kollega@firm.se")).toBeTruthy();
    expect(screen.getByText(/Inbjuden/)).toBeTruthy();
  });
});
