// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

// Fail-closed-grenen (audit 2026-08-17): utan env-nycklarna gjorde den gamla
// öppna vägen hela appen anonymt läsbar (sidorna läser med service-klienten).
// Grenen kan inte probas mot dev-servern (Next läser .env.local själv), så den
// testas här med manipulerad process.env.

const ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

function req(path: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`);
}

describe("middleware utan Supabase-env (fail closed)", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("svarar 503 på skyddad sida i stället för att släppa igenom", async () => {
    const res = await middleware(req("/arbetsyta"));
    expect(res.status).toBe(503);
    expect(await res.text()).toContain("SETUP.md");
  });

  it("svarar JSON-503 på skyddad API-route", async () => {
    const res = await middleware(req("/api/pipeline"));
    expect(res.status).toBe(503);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("släpper igenom publika paths så /login och /setup kan rendera fel", async () => {
    for (const path of ["/login", "/setup", "/api/setup/status"]) {
      const res = await middleware(req(path));
      expect(res.status, path).toBe(200);
    }
  });
});
