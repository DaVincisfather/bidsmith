import type { SupabaseClient } from "@supabase/supabase-js";

export type Organization = {
  id: string;
  name: string;
  display_name: string | null;
  logo_url: string | null;
  accent_color: string;
};

export const DEFAULT_ACCENT = "#1F2937";

export const ACCENT_PRESETS: ReadonlyArray<{ hex: string; label: string }> = [
  { hex: "#1F2937", label: "Slate" },
  { hex: "#2E5C8A", label: "Navy" },
  { hex: "#5A6F4A", label: "Sage" },
  { hex: "#8B2635", label: "Oxblood" },
  { hex: "#C9A86A", label: "Gold" },
];

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export function isValidHex(value: string): boolean {
  return HEX_RE.test(value);
}

export async function getOrganization(
  supabase: SupabaseClient,
  organizationId: string
): Promise<Organization> {
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, display_name, logo_url, accent_color")
    .eq("id", organizationId)
    .single<Organization>();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Organization not found");
  return data;
}
