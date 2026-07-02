/**
 * SSRF guard for the radar TED-XML fetch.
 *
 * The analyze route fetches an XML URL that originates from a stored
 * rfp_opportunities.raw_xml value. That value is attacker-influenceable, so a
 * bare `fetch(url)` is a server-side request forgery vector: it could reach the
 * cloud metadata endpoint (169.254.169.254), localhost, or private-range hosts.
 *
 * The legitimate source is always the TED domain (raw_xml = links.xml.MUL from
 * api.ted.europa.eu — see ted-client.ts), so a strict host allowlist is both
 * sufficient and the tightest possible fix: an IP literal, localhost, or any
 * other host simply never matches, so no separate private-IP/DNS check is
 * needed. `redirect: "manual"` stops an allowed host from bouncing the request
 * onward to an internal target.
 */

const TED_HOST = "ted.europa.eu";
const TED_HOST_SUFFIX = ".ted.europa.eu";

export class DisallowedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DisallowedUrlError";
  }
}

/**
 * True only for an https URL on the TED domain served over the default port.
 * The leading dot in the suffix check prevents suffix-injection hosts like
 * `evilted.europa.eu` or `ted.europa.eu.attacker.com`; userinfo tricks
 * (`https://ted.europa.eu@attacker.com`) are caught because URL parses the
 * hostname as the real target.
 */
export function isAllowedTedUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.port !== "" && url.port !== "443") return false;
  const host = url.hostname.toLowerCase();
  return host === TED_HOST || host.endsWith(TED_HOST_SUFFIX);
}

/**
 * Fetches a TED XML URL, rejecting anything not on the TED allowlist and
 * refusing to follow redirects. Throws DisallowedUrlError before any network
 * call when the URL is not allowed; otherwise returns the raw Response (a 3xx
 * surfaces as a non-ok response, since redirects are not followed).
 */
export async function fetchTedXml(
  rawUrl: string,
  timeoutMs = 10000,
): Promise<Response> {
  if (!isAllowedTedUrl(rawUrl)) {
    throw new DisallowedUrlError(`Refusing to fetch non-TED URL: ${rawUrl}`);
  }
  return fetch(rawUrl, {
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "manual",
  });
}
