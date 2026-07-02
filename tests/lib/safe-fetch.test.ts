// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isAllowedTedUrl,
  fetchTedXml,
  DisallowedUrlError,
} from "@/lib/safe-fetch";

describe("isAllowedTedUrl", () => {
  it("allows https URLs on the TED apex and subdomains", () => {
    expect(isAllowedTedUrl("https://ted.europa.eu/notice/1/xml")).toBe(true);
    expect(isAllowedTedUrl("https://api.ted.europa.eu/v3/notices/1")).toBe(true);
  });

  it("rejects non-https schemes", () => {
    expect(isAllowedTedUrl("http://ted.europa.eu/notice/1")).toBe(false);
    expect(isAllowedTedUrl("ftp://ted.europa.eu/notice/1")).toBe(false);
  });

  it("rejects hosts outside the TED domain", () => {
    expect(isAllowedTedUrl("https://example.com/notice")).toBe(false);
  });

  it("rejects private-range and metadata IP literals", () => {
    expect(isAllowedTedUrl("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isAllowedTedUrl("https://10.0.0.1/")).toBe(false);
    expect(isAllowedTedUrl("https://127.0.0.1/")).toBe(false);
    expect(isAllowedTedUrl("https://localhost/")).toBe(false);
  });

  it("rejects suffix-injection and userinfo tricks", () => {
    expect(isAllowedTedUrl("https://ted.europa.eu.attacker.com/")).toBe(false);
    expect(isAllowedTedUrl("https://evilted.europa.eu/")).toBe(false);
    // hostname parses as attacker.com, not ted.europa.eu
    expect(isAllowedTedUrl("https://ted.europa.eu@attacker.com/")).toBe(false);
  });

  it("rejects non-default ports even on an allowed host", () => {
    expect(isAllowedTedUrl("https://ted.europa.eu:22/")).toBe(false);
    expect(isAllowedTedUrl("https://ted.europa.eu:443/notice")).toBe(true);
  });

  it("rejects malformed URLs", () => {
    expect(isAllowedTedUrl("not a url")).toBe(false);
    expect(isAllowedTedUrl("")).toBe(false);
  });
});

describe("fetchTedXml", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws DisallowedUrlError without making a network call for a bad URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(fetchTedXml("https://169.254.169.254/")).rejects.toBeInstanceOf(
      DisallowedUrlError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches an allowed URL with redirects disabled", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("<xml/>", { status: 200 }));

    await fetchTedXml("https://ted.europa.eu/notice/1/xml");

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0];
    expect(init?.redirect).toBe("manual");
  });
});
