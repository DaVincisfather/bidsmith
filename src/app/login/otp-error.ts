/**
 * Maps Supabase's signup-not-allowed OTP error to the Swedish "not invited"
 * copy, falling back to the raw message for unknown errors (defensive substring
 * match — Supabase has no dedicated code for this).
 *
 * Lives in its own module rather than login/page.tsx: Next.js only permits
 * known page exports (default component, metadata, route config), so exporting
 * an arbitrary helper from a page file breaks `next build`.
 */
export function messageForOtpError(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("signup") && (s.includes("not allowed") || s.includes("disabled"))) {
    return "Den här adressen är inte inbjuden. Kontakta din administratör.";
  }
  return raw;
}
