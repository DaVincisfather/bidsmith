import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

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

  it("shows a success confirmation with the entered email after a successful bootstrap submit", async () => {
    // The mocked useRouter() returns a fresh object on every call, so the page's
    // effect (which depends on [router]) re-fires on every re-render — including
    // the one from typing into the email field — issuing extra /api/setup/status
    // calls beyond the initial one. Branch on the URL instead of queuing
    // call-ordered once-values, so any number of status calls resolve the same way.
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/setup/bootstrap") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ needsSetup: true }) });
    });
    vi.stubGlobal("fetch", fetchMock as never);

    render(<SetupPage />);
    await waitFor(() => expect(screen.getByLabelText(/E-post/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/E-post/), {
      target: { value: "admin@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Skapa administratörskonto/ }));

    await waitFor(() => expect(screen.getByText(/admin@example\.com/)).toBeTruthy());
    expect(screen.getByText(/Vi har skickat en inloggningslänk/)).toBeTruthy();
  });

  it("shows the server error message when bootstrap fails and does not redirect", async () => {
    const errorMessage = "Setup är redan slutförd. Logga in via /login.";
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/setup/bootstrap") {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: errorMessage }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ needsSetup: true }) });
    });
    vi.stubGlobal("fetch", fetchMock as never);

    render(<SetupPage />);
    await waitFor(() => expect(screen.getByLabelText(/E-post/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/E-post/), {
      target: { value: "admin@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Skapa administratörskonto/ }));

    await waitFor(() => expect(screen.getByText(errorMessage)).toBeTruthy());
    expect(h.replaceMock).not.toHaveBeenCalled();
  });

  it("fails open and shows the email form when the status fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network"))) as never);
    render(<SetupPage />);
    await waitFor(() => expect(screen.getByLabelText(/E-post/)).toBeTruthy());
    expect(h.replaceMock).not.toHaveBeenCalled();
  });
});
