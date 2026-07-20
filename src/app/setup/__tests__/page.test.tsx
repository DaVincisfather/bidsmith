import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ replaceMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: h.replaceMock }) }));

import SetupPage from "../page";

beforeEach(() => {
  h.replaceMock.mockReset();
  vi.restoreAllMocks();
});

describe("SetupPage", () => {
  it("redirects to /login when setup is already done", async () => {
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ needsSetup: false }) }),
    ) as never);
    render(<SetupPage />);
    await waitFor(() => expect(h.replaceMock).toHaveBeenCalledWith("/login"));
  });

  it("shows the email form on a fresh install", async () => {
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ needsSetup: true }) }),
    ) as never);
    render(<SetupPage />);
    await waitFor(() => expect(screen.getByLabelText(/E-post/)).toBeTruthy());
    expect(h.replaceMock).not.toHaveBeenCalled();
  });
});
