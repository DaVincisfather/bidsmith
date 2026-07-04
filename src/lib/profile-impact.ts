/**
 * Impact-transparens för avsändarprofilen. Ren logik (ingen React, ingen DB) så att
 * fyllnadsgraden kan enhetstestas isolerat. Grundas i bid-generator-koden:
 * `formatContext` (context.ts) lägger profilblocket FÖRST i det cachade systemblocket,
 * och varje skrivbundle skickar det som `cachedContext` — därför färgar profilen alla
 * genererade sektioner, inte bara omslaget.
 */

/** Fältnycklar som faktiskt injiceras i profilblocket (se context.ts profileBlock). */
export type ProfileFieldKey = "companyName" | "tonality" | "boilerplate";

export interface ProfileFillInput {
  companyName?: string | null;
  tonality?: string | null;
  boilerplate?: string | null;
}

export interface ProfileFieldStatus {
  key: ProfileFieldKey;
  label: string;
  filled: boolean;
  /** Vad fältet grundar i anbudstexten — visas som förklaring, inte marknadsföring. */
  role: string;
}

/**
 * Sektionerna profilblocket injiceras överst i. Härledda direkt ur skrivbundlarna i
 * src/lib/bid-generator/bundles/ (understanding, phases, quality, team,
 * requirement-matrix, generic-prose) — alla anropar formatContext(ctx) som cachedContext.
 * Ändras bundle-uppsättningen ska denna lista följa med.
 */
export const PROFILE_BID_SECTIONS: readonly string[] = [
  "Förståelse",
  "Genomförandeplan",
  "Kvalitetssäkring",
  "Team",
  "Kravmatris",
  "Övriga sektioner",
];

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Per-fält ifylld/tom-status för den aktiva profilen. null (ingen aktiv profil) → alla
 * fält tomma, vilket ger användaren rätt signal: ingen röst är på plats ännu.
 */
export function computeProfileFields(profile: ProfileFillInput | null): ProfileFieldStatus[] {
  return [
    {
      key: "companyName",
      label: "Företagsnamn",
      filled: hasText(profile?.companyName),
      role: "Namnger avsändaren i varje sektion.",
    },
    {
      key: "tonality",
      label: "Tonalitet",
      filled: hasText(profile?.tonality),
      role: "Styr rösten i all genererad text.",
    },
    {
      key: "boilerplate",
      label: "Boilerplate",
      filled: hasText(profile?.boilerplate),
      role: "Bolagsfakta AI:n får väva in — den hittar inte på utöver detta.",
    },
  ];
}

export function countFilled(fields: ProfileFieldStatus[]): number {
  return fields.filter((f) => f.filled).length;
}
