// Pure validators co-located with the settings server actions but kept
// out of actions.ts because Next 16 requires every export from a
// "use server" file to be async. These are sync helpers shared by both
// the server actions and the unit tests.

import { isValidHex } from "@/lib/organisations";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_MIMES = new Set(["image/png", "image/svg+xml", "image/jpeg"]);

export function validateOrgName(
  raw: string
): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, error: "Namnet kan inte vara tomt" };
  if (trimmed.length > 64) return { ok: false, error: "Namnet får vara högst 64 tecken" };
  return { ok: true, value: trimmed };
}

export function validateLogoFile(
  file: { size: number; type: string }
): { ok: true } | { ok: false; error: string } {
  if (!ALLOWED_LOGO_MIMES.has(file.type)) {
    return { ok: false, error: "Endast PNG, SVG eller JPEG är tillåtna" };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { ok: false, error: "Filen är större än 2 MB" };
  }
  return { ok: true };
}

export function validateAccent(
  raw: string
): { ok: true; value: string } | { ok: false; error: string } {
  if (!isValidHex(raw)) {
    return { ok: false, error: "Ogiltig hex-färg (förväntat format: #RRGGBB)" };
  }
  return { ok: true, value: raw.toLowerCase() };
}
