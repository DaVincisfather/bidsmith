# Fas 2 — Mall & profil som data: Implementationsplan

> **För agentiska arbetare:** OBLIGATORISK SUB-SKILL: Använd superpowers:subagent-driven-development
> (rekommenderat) eller superpowers:executing-plans för att exekvera denna plan task-för-task.
> Steg använder checkbox-syntax (`- [ ]`) för spårning.

**Mål:** Ett nytt konsultbolag laddar upp sin anbuds-PPTX och fyller i sin profil — och får
anbud i sin egen mall utan kodändring. Mallens struktur, teckenbudgetar och slide-mappning
flyttar från kod till ett **mallmanifest** (JSON i DB, beräknat via introspektion av
uppladdad PPTX). Bolagets röst (tonalitet, boilerplate, företagsnamn) flyttar till en
**avsändarprofil** som injiceras i skrivprompternas stabila (cachade) del.

**Arkitektur:** Tre PR:ar. **PR A** bygger introspektionsmotorn: läs PPTX-XML (JSZip +
@xmldom/xmldom), identifiera slide-typer via placeholder-signaturer, beräkna teckenbudgetar
ur shape-geometri + fontmetrik (kalibrerad mot Ekan-mallens handsatta budgetar, ±10 %-grind),
emittera versionerat manifest. Ren lib + CLI — inga produktytor rörs. **PR B** gör
genereringen manifest-driven: golden-snapshot av dagens Ekan-rendering tas FÖRST, sedan
migration (`templates`-tabell + `bids.template_id`), template-store (DB + Storage med
disk-fallback för bundlad mall), och parametrisering av loader/korrektor/call-sites.
Golden-testet bevisar att Ekan-flödet är bitidentiskt. **PR C** är profilen + ytan:
migration (`org_profiles` + storage-bucket), profilblock i cachade systemkontexten,
API-routes och `/installningar`-UI, evals-grind och Testbolaget-demon.

**Tech-stack:** TypeScript strict, vitest, Zod v4, pptx-automizer (rendering), JSZip +
@xmldom/xmldom (introspektion — finns redan transitivt via pptx-automizer, blir explicita
beroenden), Supabase (Postgres + Storage), Next.js 16 App Router.

**Grind för hela fasen:** `npx vitest run` grönt efter varje task. Evals kostar pengar och
körs bara vid markerad grind (Task 17). PR A och PR B har noll AI-kostnad (helt offline).
Uppskattad totalkostnad: **$10–20** (eval-sviten + 2 demo-anbud i Task 17–18).

**Stefan-gates (manuella steg, kan inte automatiseras):**
1. Task 8: applicera migration `004_templates.sql` i Supabase SQL Editor.
2. Task 13: applicera migration `005_org_profiles.sql` (inkl. storage-bucket).
3. Task 4 (villkorad): om kalibreringen inte når ±10 % med globala konstanter — STOPP,
   eskalera med tabell (verklig vs beräknad budget per fält). Ingen per-fält-fudge.
4. Task 18: skapa Testbolaget-mallen (omfärgad kopia av anbudsmall-v2 i PowerPoint),
   kör demon end-to-end, bedöm ton/färger.

---

## Designbeslut och avvikelser från masterplanen

Masterplanen (`2026-06-10-utvecklingsplan-master.md` §Fas 2) skrevs före kodgenomgång.
Följande avvikelser är belagda i koden och gäller:

1. **Single-workspace behålls — ingen org_id/RLS-per-org.** M4-teardownen (mergad,
   se `2026-05-30-m4-teardown-single-workspace.md`) rev medvetet ut org-modellen och
   lämnade `workspace_settings` som söm för exakt denna feature ("Per-workspace
   template/style upload UI → future onboarding feature"). Masterplanens "RLS per org"
   utgår; RLS blir `authenticated` som övriga tabeller. Vitlabel-demon ("Testbolaget AB")
   realiseras som flera mall-/profilrader + aktivt val i `workspace_settings`
   (`active_template_id`, `active_profile_id`) — varje deployment är ett bolag,
   men byte av mall+profil kräver noll kodändring, vilket är fasens poäng.
2. **Budgetarna ligger redan i DB** (`template_configs.budgets`, seedad i migration 001) —
   masterplanens "Idag ligger budgets/registry som kod" stämmer bara för registryt.
   Det som faktiskt flyttar till data: slide-registryt (`registry.ts`),
   `FIELD_METADATA.slide` (`verify-budgets.ts`), och budget-BERÄKNINGEN (idag handsatt).
   `template_configs` slutar läsas men droppas inte (applicerad i prod; städmigration
   senare). Label-mallarna (`"Fas {N} — Mål"`) är fältmodellens semantik, inte mallens —
   de stannar i kod.
3. **Mallkonvention, inte godtycklig PPTX.** Applicatorerna fyller namngivna
   `{Placeholder}`-tokens. En uppladdad mall måste följa anbudsmall-v2:s
   token-konvention (dokumenteras i `docs/template-authoring.md`, Task 6). Vitlabel =
   eget visuellt DNA (färger, fonter, logotyp, geometri) på samma semantiska skelett.
   Ekan-specifika geometri-features (timeline-highlight i `phase-detail.ts`,
   footer-breddning i `_footer.ts`) är redan koordinat-gated och no-op:ar tyst på
   främmande mallar — dokumenteras som valbara förhöjningar.
4. **Prose-dispatch på variant istället för källslide.** `prose.ts` switchar idag på
   `sourceSlide === 3|4|5` — låser främmande mallar till exakt slidordning. Manifestet
   ger varje prose-slide en `variant` (`kunden-idag` | `uppdraget` | `vision`),
   identifierad via token-signatur.
5. **Två migrationer istället för en** (`004_templates.sql` i PR B,
   `005_org_profiles.sql` i PR C) — varje PR ska kunna appliceras och verifieras separat.
6. **`bids.template_id`** (ny kolumn): export och editor måste använda SAMMA mall som
   genereringen (budgetarna beräknades för den). Gamla bids (null) faller tillbaka på
   seedade anbudsmall-v2-raden.
7. **"Standardsektioner" i profilen utgår (YAGNI):** mallens manifest avgör vilka
   sektioner som finns. Profilen = identitet + röst: `company_name`, `logo_path`,
   `colors`, `tonality`, `boilerplate`.

**Kända begränsningar — medvetet utanför fas 2 (etikett: polish, ej correctness):**
- Bid-editorns cover-förhandsvisning använder statisk PNG
  (`src/components/bid-editor/renderers/CoverRenderer.tsx` →
  `/templates/anbudsmall-v2-cover.png`) — visar Ekan-design oavsett aktiv mall.
  Exporten blir korrekt; editor-bakgrunden är kosmetik.
- `deterministic/certifications.ts` har hårdkodade cert-data (TODO i filen pekar redan
  mot framtida profilfält).
- Mall-versionshantering är append-only (`unique(name, version)`); ingen UI för
  versionshistorik.

---

## Mallmanifestet (kontraktet)

```typescript
interface TemplateManifest {
  manifestVersion: 1;
  name: string;                       // t.ex. "anbudsmall-v2"
  slides: ManifestSlide[];            // renderingsordning = mallordning
  budgets: FieldBudgets;              // fältsökväg → teckenbudget (ersätter template_configs)
  fieldSlides: Record<string, number>; // fältsökväg → 1-indexerad deck-slide (ersätter FIELD_METADATA.slide)
  excludedSlides: { source: number; reason: string }[]; // illustrativa kopior m.m.
}
interface ManifestSlide {
  source: number;                     // 1-baserat slide-index i mallens PPTX
  type: SlideType;                    // befintlig union i types.ts
  variant?: "kunden-idag" | "uppdraget" | "vision"; // endast prose
  cloneFrom?: "phases" | "references";
  itemCaps?: Record<string, number>;
  placeholders: string[];             // tokens introspektionen fann (för UI-preview)
}
```

Introspektionen FÖRESLÅR manifestet; det committade/sparade manifestet är auktoritativt
(CLI:t skriver JSON som kan handjusteras före commit; UI:t visar preview före aktivering).
För Ekan-mallen pinnas `fieldSlides` till FIELD_METADATAs nuvarande värden
(6, 7, 11, 18) för beteendeparitet — introspektionens beräknade värden är förslag.

---

## Branchstrategi

- **PR A** — Task 0–6 på `fas-2a-introspektion`: introspektionsmotor + manifest + kalibrering
  + CLI + committat Ekan-manifest + authoring-guide. Inga produktytor, ingen migration,
  $0 AI-kostnad.
- **PR B** — Task 7–12 på `fas-2b-manifest-drift`, från `main` EFTER att PR A mergats:
  golden-snapshot → migration 004 → template-store → parametrisering. Grindas av
  golden-testet (Ekan bitidentisk före/efter).
- **PR C** — Task 13–18 på `fas-2c-profil-ui`, från `main` EFTER att PR B mergats:
  migration 005 → profil i prompt → API + UI → evals-grind → Testbolaget-demo.

En commit per avslutat task-steg enligt commitstegen. Worktree per PR enligt
`~/projects/bidsmith-<branch>/`-konventionen.

---

# PR A — Introspektionsmotor (`fas-2a-introspektion`)

### Task 0: Branch, beroenden och baseline

**Filer:**
- Ändra: `package.json` (dependencies)

- [ ] **Steg 1: Skapa worktree + branch från main**

```bash
git -C ~/projects/bidsmith-main fetch bidsmith
git -C ~/projects/bidsmith-main worktree add ~/projects/bidsmith-fas2a -b fas-2a-introspektion bidsmith/main
cd ~/projects/bidsmith-fas2a && cp ../bidsmith-main/.env.local . && npm install
```

- [ ] **Steg 2: Verifiera baseline**

Kör: `npx vitest run`
Förväntat: PASS (alla befintliga tester gröna). Vid rött: STOPP, rapportera.

- [ ] **Steg 3: Gör jszip + @xmldom/xmldom till explicita beroenden**

De finns redan i `node_modules` (transitivt via pptx-automizer) men introspektionen får
inte vila på transitiva beroenden:

```bash
npm install jszip @xmldom/xmldom
```

Verifiera: `package.json` listar båda under `dependencies`; `npx vitest run` fortfarande grönt.

- [ ] **Steg 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(fas2): promote jszip + @xmldom/xmldom to explicit dependencies"
```

---

### Task 1: Manifest-typer + Zod-schema

**Filer:**
- Skapa: `src/lib/pptx-template/manifest-types.ts`
- Test: `src/lib/pptx-template/__tests__/manifest-types.test.ts`

- [ ] **Steg 1: Skriv failande test**

```typescript
// src/lib/pptx-template/__tests__/manifest-types.test.ts
import { describe, it, expect } from "vitest";
import { TemplateManifestSchema } from "../manifest-types";

const validManifest = {
  manifestVersion: 1,
  name: "anbudsmall-v2",
  slides: [
    { source: 1, type: "cover", placeholders: ["{Upphandlingens namn}"] },
    {
      source: 7,
      type: "phase-detail",
      cloneFrom: "phases",
      itemCaps: { activities: 4, deliverables: 3, decisions: 3 },
      placeholders: ["{Mål}", "{Aktiviteter}"],
    },
    { source: 3, type: "prose", variant: "kunden-idag", placeholders: ["{Nuläge}"] },
  ],
  budgets: { "phases[*].objective": 120 },
  fieldSlides: { "phases[*].objective": 7 },
  excludedSlides: [{ source: 8, reason: "duplikat av slide 7 — illustrativ kopia" }],
};

describe("TemplateManifestSchema", () => {
  it("accepterar ett giltigt manifest", () => {
    expect(TemplateManifestSchema.safeParse(validManifest).success).toBe(true);
  });

  it("avvisar okänd slide-typ", () => {
    const bad = {
      ...validManifest,
      slides: [{ source: 1, type: "hero", placeholders: [] }],
    };
    expect(TemplateManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("avvisar variant på icke-prose", () => {
    const bad = {
      ...validManifest,
      slides: [{ source: 1, type: "cover", variant: "vision", placeholders: [] }],
    };
    expect(TemplateManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("avvisar manifestVersion ≠ 1", () => {
    expect(
      TemplateManifestSchema.safeParse({ ...validManifest, manifestVersion: 2 }).success,
    ).toBe(false);
  });
});
```

- [ ] **Steg 2: Kör testet — ska faila**

Kör: `npx vitest run src/lib/pptx-template/__tests__/manifest-types.test.ts`
Förväntat: FAIL — `Cannot find module '../manifest-types'`

- [ ] **Steg 3: Implementera**

```typescript
// src/lib/pptx-template/manifest-types.ts
import { z } from "zod";
import { FieldBudgetsSchema } from "./budget-types";

// Måste spegla SlideType-unionen i types.ts — testas indirekt via
// identify-slides-testen som matchar mot registryts konfiguration.
export const SLIDE_TYPES = [
  "cover",
  "toc",
  "prose",
  "phases-overview",
  "phase-detail",
  "quality-assurance",
  "team-pricing",
  "requirement-matrix",
  "reference",
  "confidentiality",
  "certifications",
] as const;

export const PROSE_VARIANTS = ["kunden-idag", "uppdraget", "vision"] as const;
export type ProseVariant = (typeof PROSE_VARIANTS)[number];

export const ManifestSlideSchema = z
  .object({
    source: z.number().int().positive(),
    type: z.enum(SLIDE_TYPES),
    variant: z.enum(PROSE_VARIANTS).optional(),
    cloneFrom: z.enum(["phases", "references"]).optional(),
    itemCaps: z.record(z.string(), z.number().int().positive()).optional(),
    placeholders: z.array(z.string()),
  })
  .refine((s) => s.variant === undefined || s.type === "prose", {
    message: "variant är endast giltig för type 'prose'",
  });

export const TemplateManifestSchema = z.object({
  manifestVersion: z.literal(1),
  name: z.string().min(1),
  slides: z.array(ManifestSlideSchema).min(1),
  budgets: FieldBudgetsSchema,
  fieldSlides: z.record(z.string(), z.number().int().positive()),
  excludedSlides: z.array(
    z.object({ source: z.number().int().positive(), reason: z.string() }),
  ),
});

export type ManifestSlide = z.infer<typeof ManifestSlideSchema>;
export type TemplateManifest = z.infer<typeof TemplateManifestSchema>;
```

- [ ] **Steg 4: Kör testet — ska passera**

Kör: `npx vitest run src/lib/pptx-template/__tests__/manifest-types.test.ts`
Förväntat: PASS (4 tester)

- [ ] **Steg 5: Commit**

```bash
git add src/lib/pptx-template/manifest-types.ts src/lib/pptx-template/__tests__/manifest-types.test.ts
git commit -m "feat(fas2): template manifest types + zod schema"
```

---

### Task 2: PPTX-läsare — shapes, tokens, geometri, fontmetrik

**Filer:**
- Skapa: `src/lib/pptx-template/introspect/read-pptx.ts`
- Test: `src/lib/pptx-template/introspect/__tests__/read-pptx.test.ts`

Testar mot den riktiga mallen `templates/anbudsmall-v2.pptx` (versionsspårad — samma
mönster som `smoke.test.ts`).

- [ ] **Steg 1: Skriv failande test**

```typescript
// src/lib/pptx-template/introspect/__tests__/read-pptx.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "fs/promises";
import path from "path";
import { readPptxSlides, type SlideShapes } from "../read-pptx";

const TEMPLATE = path.resolve("templates", "anbudsmall-v2.pptx");

describe("readPptxSlides (anbudsmall-v2.pptx)", () => {
  let slides: SlideShapes[];
  beforeAll(async () => {
    slides = await readPptxSlides(await readFile(TEMPLATE));
  });

  it("läser alla 17 slides i presentationsordning", () => {
    expect(slides).toHaveLength(17);
    expect(slides.map((s) => s.source)).toEqual(
      Array.from({ length: 17 }, (_, i) => i + 1),
    );
  });

  it("hittar cover-tokens på slide 1", () => {
    expect(slides[0].tokens).toEqual(
      expect.arrayContaining(["{Upphandlingens namn}", "{Kundnamn}", "{Anbudsdatum}"]),
    );
  });

  it("hittar phase-detail-tokens på slide 7, inkl. split-run-placeholders", () => {
    // {Aktiviteter}/{Leveranser} splittras av PowerPoints rättstavning över
    // flera <a:r>-runs — paragraf-konkatenering krävs (samma trick som
    // replaceParagraphTextNodes i _footer.ts).
    expect(slides[6].tokens).toEqual(
      expect.arrayContaining([
        "{Mål}",
        "{Aktiviteter}",
        "{Leveranser}",
        "{Beslut}",
        "{Fas 1 — namn}",
        "{M1–M2}",
      ]),
    );
  });

  it("ger geometri och fontstorlek för shapen som bär {Mål}", () => {
    const shape = slides[6].shapes.find((sh) => sh.tokens.includes("{Mål}"));
    expect(shape).toBeDefined();
    expect(shape!.geometry).not.toBeNull();
    expect(shape!.geometry!.cx).toBeGreaterThan(0);
    expect(shape!.geometry!.cy).toBeGreaterThan(0);
    expect(shape!.fontSizePt).toBeGreaterThan(4);
    expect(shape!.fontSizePt).toBeLessThan(100);
  });
});
```

- [ ] **Steg 2: Kör testet — ska faila**

Kör: `npx vitest run src/lib/pptx-template/introspect/__tests__/read-pptx.test.ts`
Förväntat: FAIL — modulen finns inte

- [ ] **Steg 3: Implementera läsaren**

```typescript
// src/lib/pptx-template/introspect/read-pptx.ts
import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";

const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";
const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export interface ShapeText {
  /** Paragraftexter — runs konkatenerade per <a:p> (split-run-säkert) */
  paragraphs: string[];
  /** {Token}-placeholders funna i paragraferna */
  tokens: string[];
  /** EMU-geometri ur <a:xfrm>; null när shapen ärver från layouten */
  geometry: { x: number; y: number; cx: number; cy: number } | null;
  /** Punktstorlek från första <a:rPr sz=...> (eller defRPr); null om ingen explicit */
  fontSizePt: number | null;
  /** Radavstånd i procent ur <a:lnSpc><a:spcPct>; null = mallens default */
  lineSpacingPct: number | null;
}

export interface SlideShapes {
  /** 1-baserat slide-index i presentationsordning */
  source: number;
  shapes: ShapeText[];
  /** Union av shape-tokens på sliden */
  tokens: string[];
}

const TOKEN_RE = /\{[^{}]+\}/g;

export async function readPptxSlides(buffer: Buffer): Promise<SlideShapes[]> {
  const zip = await JSZip.loadAsync(buffer);
  const parser = new DOMParser();

  const presXml = await readEntry(zip, "ppt/presentation.xml");
  const relsXml = await readEntry(zip, "ppt/_rels/presentation.xml.rels");
  const pres = parser.parseFromString(presXml, "application/xml");
  const rels = parser.parseFromString(relsXml, "application/xml");

  // r:id → target ("slides/slide1.xml")
  const relTargets = new Map<string, string>();
  const relNodes = rels.getElementsByTagName("Relationship");
  for (let i = 0; i < relNodes.length; i++) {
    const rel = relNodes[i];
    relTargets.set(rel.getAttribute("Id") ?? "", rel.getAttribute("Target") ?? "");
  }

  // <p:sldIdLst> ger presentationsordningen — filnamnsordning (slide10 < slide2
  // lexikografiskt) är en klassisk fälla.
  const sldIds = pres.getElementsByTagNameNS(P_NS, "sldId");
  const slidePaths: string[] = [];
  for (let i = 0; i < sldIds.length; i++) {
    const rId = sldIds[i].getAttributeNS(R_NS, "id") ?? "";
    const target = relTargets.get(rId);
    if (target) slidePaths.push(`ppt/${target.replace(/^\//, "")}`);
  }

  const result: SlideShapes[] = [];
  for (let i = 0; i < slidePaths.length; i++) {
    const xml = await readEntry(zip, slidePaths[i]);
    const doc = parser.parseFromString(xml, "application/xml");
    const shapes = extractShapes(doc);
    result.push({
      source: i + 1,
      shapes,
      tokens: [...new Set(shapes.flatMap((s) => s.tokens))],
    });
  }
  return result;
}

async function readEntry(zip: JSZip, name: string): Promise<string> {
  const entry = zip.file(name);
  if (!entry) throw new Error(`PPTX saknar ${name} — är filen en giltig presentation?`);
  return entry.async("string");
}

function extractShapes(doc: ReturnType<DOMParser["parseFromString"]>): ShapeText[] {
  const shapes: ShapeText[] = [];
  const spNodes = doc.getElementsByTagNameNS(P_NS, "sp");
  for (let i = 0; i < spNodes.length; i++) {
    const sp = spNodes[i];
    const txBodies = sp.getElementsByTagNameNS(P_NS, "txBody");
    if (txBodies.length === 0) continue;
    const txBody = txBodies[0];

    const paragraphs: string[] = [];
    const pNodes = txBody.getElementsByTagNameNS(A_NS, "p");
    for (let j = 0; j < pNodes.length; j++) {
      const tNodes = pNodes[j].getElementsByTagNameNS(A_NS, "t");
      let text = "";
      for (let k = 0; k < tNodes.length; k++) text += tNodes[k].textContent ?? "";
      paragraphs.push(text);
    }

    const tokens = [...new Set(paragraphs.flatMap((p) => p.match(TOKEN_RE) ?? []))];

    shapes.push({
      paragraphs,
      tokens,
      geometry: readGeometry(sp),
      fontSizePt: readFontSizePt(txBody),
      lineSpacingPct: readLineSpacingPct(txBody),
    });
  }
  return shapes;
}

function readGeometry(sp: Element): ShapeText["geometry"] {
  // Endast shapens egen <p:spPr><a:xfrm> — gruppers/layouters transform ignoreras.
  // Budget-bärande boxar i konventionen måste ha explicit geometri (authoring-guiden).
  const spPrs = sp.getElementsByTagNameNS(P_NS, "spPr");
  if (spPrs.length === 0) return null;
  const xfrms = spPrs[0].getElementsByTagNameNS(A_NS, "xfrm");
  if (xfrms.length === 0) return null;
  const off = xfrms[0].getElementsByTagNameNS(A_NS, "off")[0];
  const ext = xfrms[0].getElementsByTagNameNS(A_NS, "ext")[0];
  if (!off || !ext) return null;
  return {
    x: Number(off.getAttribute("x")),
    y: Number(off.getAttribute("y")),
    cx: Number(ext.getAttribute("cx")),
    cy: Number(ext.getAttribute("cy")),
  };
}

function readFontSizePt(txBody: Element): number | null {
  // sz anges i hundradels punkter (1800 = 18 pt). Första explicita vinner:
  // rPr på en run, annars defRPr på paragrafnivå.
  for (const tag of ["rPr", "defRPr"]) {
    const nodes = txBody.getElementsByTagNameNS(A_NS, tag);
    for (let i = 0; i < nodes.length; i++) {
      const sz = nodes[i].getAttribute("sz");
      if (sz) return Number(sz) / 100;
    }
  }
  return null;
}

function readLineSpacingPct(txBody: Element): number | null {
  const lnSpcs = txBody.getElementsByTagNameNS(A_NS, "lnSpc");
  if (lnSpcs.length === 0) return null;
  const pct = lnSpcs[0].getElementsByTagNameNS(A_NS, "spcPct")[0];
  if (!pct) return null;
  // spcPct val är i tusendels procent (140000 = 140 %)
  return Number(pct.getAttribute("val")) / 1000;
}
```

OBS: `@xmldom/xmldom`:s `Element`-typ är strukturellt kompatibel med DOM-lib:ens —
om tsc klagar på typerna, typa `sp`/`txBody` som `Element` importerad från
`@xmldom/xmldom` istället för lib.dom.

- [ ] **Steg 4: Kör testet — ska passera**

Kör: `npx vitest run src/lib/pptx-template/introspect/__tests__/read-pptx.test.ts`
Förväntat: PASS (4 tester). Om token-assertionerna failar: dumpa `slides[N].tokens`
med `console.log` och justera FÖRVÄNTNINGARNA endast om avvikelsen beror på exakta
unicode-tecken (em/en-dash) — inte genom att försvaga testet.

- [ ] **Steg 5: Commit**

```bash
git add src/lib/pptx-template/introspect/
git commit -m "feat(fas2): pptx introspection reader — shapes, tokens, geometry, font metrics"
```

---

### Task 3: Slide-identifiering via token-signaturer

**Filer:**
- Skapa: `src/lib/pptx-template/introspect/identify-slides.ts`
- Test: `src/lib/pptx-template/introspect/__tests__/identify-slides.test.ts`

Facit: identifieringen av `templates/anbudsmall-v2.pptx` ska reproducera
`ANBUDSMALL_V2.slides` i `registry.ts` EXAKT (source, type, cloneFrom, itemCaps)
plus exkludera 8, 9, 10, 15 som dubletter och 2 som statisk toc.

- [ ] **Steg 1: Skriv failande test**

```typescript
// src/lib/pptx-template/introspect/__tests__/identify-slides.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "fs/promises";
import path from "path";
import { readPptxSlides, type SlideShapes } from "../read-pptx";
import { identifySlides } from "../identify-slides";

const TEMPLATE = path.resolve("templates", "anbudsmall-v2.pptx");

describe("identifySlides (anbudsmall-v2.pptx)", () => {
  let slides: SlideShapes[];
  beforeAll(async () => {
    slides = await readPptxSlides(await readFile(TEMPLATE));
  });

  it("reproducerar registryts slide-konfiguration", () => {
    const { included } = identifySlides(slides);
    expect(
      included.map(({ source, type, variant, cloneFrom, itemCaps }) => ({
        source, type, variant, cloneFrom, itemCaps,
      })),
    ).toEqual([
      { source: 1,  type: "cover", variant: undefined, cloneFrom: undefined, itemCaps: undefined },
      { source: 2,  type: "toc", variant: undefined, cloneFrom: undefined, itemCaps: undefined },
      { source: 3,  type: "prose", variant: "kunden-idag", cloneFrom: undefined, itemCaps: undefined },
      { source: 4,  type: "prose", variant: "uppdraget", cloneFrom: undefined, itemCaps: undefined },
      { source: 5,  type: "prose", variant: "vision", cloneFrom: undefined, itemCaps: undefined },
      { source: 6,  type: "phases-overview", variant: undefined, cloneFrom: undefined, itemCaps: { phases: 4 } },
      { source: 7,  type: "phase-detail", variant: undefined, cloneFrom: "phases",
        itemCaps: { activities: 4, deliverables: 3, decisions: 3 } },
      { source: 11, type: "quality-assurance", variant: undefined, cloneFrom: undefined, itemCaps: undefined },
      { source: 12, type: "team-pricing", variant: undefined, cloneFrom: undefined, itemCaps: undefined },
      { source: 13, type: "requirement-matrix", variant: undefined, cloneFrom: undefined, itemCaps: undefined },
      { source: 14, type: "reference", variant: undefined, cloneFrom: "references", itemCaps: undefined },
      { source: 16, type: "confidentiality", variant: undefined, cloneFrom: undefined, itemCaps: undefined },
      { source: 17, type: "certifications", variant: undefined, cloneFrom: undefined, itemCaps: undefined },
    ]);
  });

  it("exkluderar illustrativa kopior med dublettorsak", () => {
    const { excluded } = identifySlides(slides);
    expect(excluded.map((e) => e.source).sort((a, b) => a - b)).toEqual([8, 9, 10, 15]);
    expect(excluded.find((e) => e.source === 8)!.reason).toMatch(/duplikat av slide 7/);
  });
});
```

- [ ] **Steg 2: Kör testet — ska faila**

Kör: `npx vitest run src/lib/pptx-template/introspect/__tests__/identify-slides.test.ts`
Förväntat: FAIL — modulen finns inte

- [ ] **Steg 3: Implementera**

Signaturtabellen är härledd ur applicatorernas placeholder-maps (verifierad mot koden
2026-06-12). Matchningsregler:
1. En slide matchar en signatur när ALLA `requires`-tokens finns bland slidens tokens.
2. Matchar flera signaturer → kasta fel (fail-loud; signaturerna ska vara disjunkta).
3. Andra+ träffen på samma signatur → exkluderas som `duplikat av slide N — illustrativ kopia`
   (Ekans mockup-slides 8–10 är kopior av 7, 15 av 14).
4. Ingen träff + inga content-tokens (bara footer: `{Bolagsnamn}`/`{Diarienummer}` eller
   tomt) → typ `toc` om det är första sådana sliden, annars exkludera
   (`statisk slide utan kända placeholders`).
5. Ingen träff men HAR okända content-tokens → exkludera med listan av tokens i reason
   (syns i UI-previewn så mallförfattaren ser vad som inte känns igen).

```typescript
// src/lib/pptx-template/introspect/identify-slides.ts
import type { SlideShapes } from "./read-pptx";
import type { ManifestSlide } from "../manifest-types";

const EM = "—"; // —
const EN = "–"; // –

interface SlideSignature {
  type: ManifestSlide["type"];
  variant?: ManifestSlide["variant"];
  requires: string[];
  cloneFrom?: ManifestSlide["cloneFrom"];
  itemCaps?: Record<string, number>;
}

// Härledd ur applicatorernas placeholder-maps — uppdatera båda vid konventionsändring.
// itemCaps speglar registryts värden (slot-antal i mallens layout).
const SIGNATURES: SlideSignature[] = [
  { type: "cover", requires: ["{Upphandlingens namn}", "{Kundnamn}", "{Anbudsdatum}"] },
  { type: "prose", variant: "kunden-idag", requires: ["{Nuläge}", "{Smärtpunkter}"] },
  { type: "prose", variant: "uppdraget", requires: ["{Stycken}"] },
  { type: "prose", variant: "vision", requires: ["{Utmaningar}", "{Värden}"] },
  {
    type: "phases-overview",
    requires: [`{Fas 1 ${EM} namn}`, "{Fas 1}", `{Fas 2 ${EM} namn}`],
    itemCaps: { phases: 4 },
  },
  {
    type: "phase-detail",
    requires: ["{Mål}", "{Aktiviteter}", "{Leveranser}", "{Beslut}"],
    cloneFrom: "phases",
    itemCaps: { activities: 4, deliverables: 3, decisions: 3 },
  },
  {
    type: "quality-assurance",
    requires: ["{QA-process}", "{Kvalitetsledare}", "{Eskalering}"],
  },
  { type: "team-pricing", requires: [`{Konsult 1 ${EM} namn}`, "{Summa timmar}"] },
  {
    type: "requirement-matrix",
    requires: [`{Ska-krav 1 ${EM} formulering enligt upphandlingsunderlag}`],
  },
  { type: "reference", requires: [`{Referens 1 ${EM} kundnamn}`], cloneFrom: "references" },
  { type: "confidentiality", requires: ["{OSL kap X §Y}"] },
  { type: "certifications", requires: ["{Certifikatnummer}", "{Giltighetstid}"] },
];

const FOOTER_TOKENS = new Set(["{Bolagsnamn}", "{Diarienummer}"]);

export interface IdentifiedSlides {
  included: ManifestSlide[];
  excluded: { source: number; reason: string }[];
}

export function identifySlides(slides: SlideShapes[]): IdentifiedSlides {
  const included: ManifestSlide[] = [];
  const excluded: IdentifiedSlides["excluded"] = [];
  const firstMatch = new Map<SlideSignature, number>(); // signatur → source som vann
  let tocAssigned = false;

  for (const slide of slides) {
    const tokenSet = new Set(slide.tokens);
    const matches = SIGNATURES.filter((sig) =>
      sig.requires.every((t) => tokenSet.has(t)),
    );

    if (matches.length > 1) {
      throw new Error(
        `slide ${slide.source} matchar flera signaturer (${matches
          .map((m) => m.type)
          .join(", ")}) — signaturtabellen ska vara disjunkt`,
      );
    }

    if (matches.length === 1) {
      const sig = matches[0];
      const winner = firstMatch.get(sig);
      if (winner !== undefined) {
        excluded.push({
          source: slide.source,
          reason: `duplikat av slide ${winner} — illustrativ kopia`,
        });
        continue;
      }
      firstMatch.set(sig, slide.source);
      included.push({
        source: slide.source,
        type: sig.type,
        ...(sig.variant ? { variant: sig.variant } : {}),
        ...(sig.cloneFrom ? { cloneFrom: sig.cloneFrom } : {}),
        ...(sig.itemCaps ? { itemCaps: sig.itemCaps } : {}),
        placeholders: slide.tokens,
      });
      continue;
    }

    const contentTokens = slide.tokens.filter((t) => !FOOTER_TOKENS.has(t));
    if (contentTokens.length === 0 && !tocAssigned) {
      tocAssigned = true;
      included.push({ source: slide.source, type: "toc", placeholders: slide.tokens });
    } else if (contentTokens.length === 0) {
      excluded.push({
        source: slide.source,
        reason: "statisk slide utan kända placeholders",
      });
    } else {
      excluded.push({
        source: slide.source,
        reason: `okända placeholders: ${contentTokens.join(", ")}`,
      });
    }
  }

  return { included, excluded };
}
```

- [ ] **Steg 4: Kör testet — ska passera**

Kör: `npx vitest run src/lib/pptx-template/introspect/__tests__/identify-slides.test.ts`
Förväntat: PASS. Om en `requires`-token inte finns i mallen (t.ex. annan dash-variant):
verifiera den EXAKTA tokensträngen via `console.log(slides[N].tokens)` och rätta
signaturtabellen — applicatorernas strängar är facit (de är vad som faktiskt ersätts
vid rendering).

- [ ] **Steg 5: Commit**

```bash
git add src/lib/pptx-template/introspect/identify-slides.ts src/lib/pptx-template/introspect/__tests__/identify-slides.test.ts
git commit -m "feat(fas2): slide type identification via placeholder signatures"
```

---

### Task 4: Budgetberäkning ur geometri + fontmetrik (KALIBRERINGSGRIND)

**Filer:**
- Skapa: `src/lib/pptx-template/introspect/compute-budgets.ts`
- Test: `src/lib/pptx-template/introspect/__tests__/compute-budgets.test.ts`

**Facit (handsatta Ekan-budgetar ur migration 001, `template_configs`):**

| Fältsökväg | Budget | Token | Box |
|---|---|---|---|
| `phases[*].name` | 40 | `{Fas 1 — namn}` | slide 6 + 7 (min vinner) |
| `phases[*].period` | 10 | `{M1–M2}` | slide 6 + 7 (min vinner) |
| `phases[*].objective` | 120 | `{Mål}` | slide 7 |
| `phases[*].activities[*]` | 120 | `{Aktiviteter}` | slide 7, delat på cap 4 |
| `phases[*].deliverables[*]` | 100 | `{Leveranser}` | slide 7, delat på cap 3 |
| `phases[*].decisions[*]` | 100 | `{Beslut}` | slide 7, delat på cap 3 |
| `checkpoints[*]` | 80 | `{Avstämning 1 — tidpunkt och innehåll}` | slide 11 |
| `certs[*].description` | 80 | `{Beskrivning}` | slide 17 |

**Kalibreringsgrind:** alla 8 beräknade budgetar inom ±10 % av facit, med GLOBALA
konstanter (`CHAR_WIDTH_FACTOR`, `FILL_FACTOR`). Tillåtet att justera de två konstanterna
och `maxLines` per TOKEN-spec (fältsemantik, gäller alla mallar). FÖRBJUDET: per-fält-
eller per-mall-fudgefaktorer — då har vi bara kodat om facit och formeln förutsäger inget
för främmande mallar. Når kalibreringen inte ±10 %: STOPP, eskalera till Stefan med
tabellen verklig vs beräknad (Stefan-gate 3).

- [ ] **Steg 1: Skriv failande test**

```typescript
// src/lib/pptx-template/introspect/__tests__/compute-budgets.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "fs/promises";
import path from "path";
import { readPptxSlides, type SlideShapes } from "../read-pptx";
import { identifySlides } from "../identify-slides";
import { computeBudgets } from "../compute-budgets";

const TEMPLATE = path.resolve("templates", "anbudsmall-v2.pptx");

// Handsatta budgetar ur migration 001 (template_configs) — kalibreringsfacit.
const EKAN_BUDGETS: Record<string, number> = {
  "phases[*].name": 40,
  "phases[*].period": 10,
  "phases[*].objective": 120,
  "phases[*].activities[*]": 120,
  "phases[*].deliverables[*]": 100,
  "phases[*].decisions[*]": 100,
  "checkpoints[*]": 80,
  "certs[*].description": 80,
};

describe("computeBudgets — kalibrering mot Ekan-mallen (±10 %)", () => {
  let slides: SlideShapes[];
  beforeAll(async () => {
    slides = await readPptxSlides(await readFile(TEMPLATE));
  });

  it("reproducerar alla 8 handsatta budgetar inom ±10 %", () => {
    const { budgets } = computeBudgets(slides, identifySlides(slides).included);
    const report: string[] = [];
    for (const [field, expected] of Object.entries(EKAN_BUDGETS)) {
      const actual = budgets[field];
      const ratio = actual / expected;
      report.push(`${field}: facit ${expected}, beräknad ${actual} (${(ratio * 100).toFixed(0)} %)`);
      expect(actual, report.join("\n")).toBeGreaterThanOrEqual(expected * 0.9);
      expect(actual, report.join("\n")).toBeLessThanOrEqual(expected * 1.1);
    }
  });

  it("beräknar fieldSlides ur slide-ordningen", () => {
    const { fieldSlides } = computeBudgets(slides, identifySlides(slides).included);
    // Deck-position med nominella kloner (phases=itemCap, references=2):
    // cover 1, toc 2, prose 3–5, overview 6, detail 7–10, qa 11 ...
    expect(fieldSlides["phases[*].name"]).toBe(6);
    expect(fieldSlides["phases[*].objective"]).toBe(7);
    expect(fieldSlides["checkpoints[*]"]).toBe(11);
  });
});
```

- [ ] **Steg 2: Kör testet — ska faila**

Kör: `npx vitest run src/lib/pptx-template/introspect/__tests__/compute-budgets.test.ts`
Förväntat: FAIL — modulen finns inte

- [ ] **Steg 3: Implementera**

```typescript
// src/lib/pptx-template/introspect/compute-budgets.ts
import type { SlideShapes, ShapeText } from "./read-pptx";
import type { ManifestSlide } from "../manifest-types";
import type { FieldBudgets } from "../budget-types";

const EM = "—";
const EN = "–";
const EMU_PER_PT = 12700;

// KALIBRERINGSKONSTANTER — globala, trimmade så Ekan-mallen reproducerar sina
// handsatta budgetar inom ±10 % (compute-budgets.test.ts pinnar dem).
// Per-fält/per-mall-overrides är förbjudna — då förutsäger formeln inget.
const CHAR_WIDTH_FACTOR = 0.5;   // snitteckenbredd ≈ 0,5 × fontstorlek (sans-serif)
const FILL_FACTOR = 0.9;         // nyttjandegrad av boxen (padding, ojämn högermarg)
const DEFAULT_LINE_SPACING_PCT = 120;
const DEFAULT_FONT_PT = 18;
const ROUND_TO = 5;              // budgetar avrundas till närmsta 5 (facit är runda tal)

interface BudgetTokenSpec {
  fieldPath: string;
  /** Dela boxkapaciteten med slidens itemCaps[key] (en-box-kolumner med flera items) */
  divideByCap?: string;
  /** Maxrader oavsett boxhöjd — fältsemantik (t.ex. namn/period är enradiga) */
  maxLines?: number;
}

// Tokens vars innehåll är AI-skrivet och längdbudgeterat. Övriga tokens
// (kundnamn, datum, konsultrader) fylls deterministiskt och behöver ingen budget.
const BUDGET_TOKENS: Record<string, BudgetTokenSpec> = {
  [`{Fas 1 ${EM} namn}`]: { fieldPath: "phases[*].name", maxLines: 1 },
  [`{M1${EN}M2}`]: { fieldPath: "phases[*].period", maxLines: 1 },
  "{Mål}": { fieldPath: "phases[*].objective" },
  "{Aktiviteter}": { fieldPath: "phases[*].activities[*]", divideByCap: "activities" },
  "{Leveranser}": { fieldPath: "phases[*].deliverables[*]", divideByCap: "deliverables" },
  "{Beslut}": { fieldPath: "phases[*].decisions[*]", divideByCap: "decisions" },
  [`{Avstämning 1 ${EM} tidpunkt och innehåll}`]: { fieldPath: "checkpoints[*]" },
  "{Beskrivning}": { fieldPath: "certs[*].description" },
};

/** Nominellt klonantal när deck-positioner beräknas (references saknar itemCap). */
const NOMINAL_REFERENCE_CLONES = 2;

export interface ComputedBudgets {
  budgets: FieldBudgets;
  fieldSlides: Record<string, number>;
  /** Tokens i BUDGET_TOKENS som hittades men saknar geometri/typsnitt */
  warnings: string[];
}

export function computeBudgets(
  slides: SlideShapes[],
  included: ManifestSlide[],
): ComputedBudgets {
  const budgets: FieldBudgets = {};
  const fieldSlides: Record<string, number> = {};
  const warnings: string[] = [];

  const deckPositions = computeDeckPositions(included);
  const bySource = new Map(slides.map((s) => [s.source, s]));

  for (const slideCfg of included) {
    const slide = bySource.get(slideCfg.source);
    if (!slide) continue;

    for (const shape of slide.shapes) {
      for (const token of shape.tokens) {
        const spec = BUDGET_TOKENS[token];
        if (!spec) continue;

        if (!shape.geometry) {
          warnings.push(
            `${token} på slide ${slideCfg.source} saknar explicit geometri — budget kan inte beräknas`,
          );
          continue;
        }

        const divisor = spec.divideByCap
          ? (slideCfg.itemCaps?.[spec.divideByCap] ?? 1)
          : 1;
        const capacity = boxCapacity(shape, spec.maxLines) / divisor;
        const rounded = Math.max(
          ROUND_TO,
          Math.round(capacity / ROUND_TO) * ROUND_TO,
        );

        // Samma fält i flera boxar (namn/period på både overview och detail):
        // den snålaste boxen sätter budgeten; första förekomstens deck-position
        // blir flaggans slide (matchar FIELD_METADATAs nuvarande semantik).
        if (budgets[spec.fieldPath] === undefined || rounded < budgets[spec.fieldPath]) {
          budgets[spec.fieldPath] = rounded;
        }
        if (fieldSlides[spec.fieldPath] === undefined) {
          fieldSlides[spec.fieldPath] = deckPositions.get(slideCfg.source) ?? slideCfg.source;
        }
      }
    }
  }

  return { budgets, fieldSlides, warnings };
}

function boxCapacity(shape: ShapeText, maxLines?: number): number {
  const fontPt = shape.fontSizePt ?? DEFAULT_FONT_PT;
  const lineSpacingPct = shape.lineSpacingPct ?? DEFAULT_LINE_SPACING_PCT;
  const lineHeightEmu = fontPt * EMU_PER_PT * (lineSpacingPct / 100);
  const charWidthEmu = fontPt * EMU_PER_PT * CHAR_WIDTH_FACTOR;

  const geometricLines = Math.max(1, Math.floor(shape.geometry!.cy / lineHeightEmu));
  const lines = maxLines !== undefined ? Math.min(maxLines, geometricLines) : geometricLines;
  const charsPerLine = Math.floor(shape.geometry!.cx / charWidthEmu);

  return lines * charsPerLine * FILL_FACTOR;
}

/** 1-indexerad deck-position per source-slide, med nominella klonantal. */
function computeDeckPositions(included: ManifestSlide[]): Map<number, number> {
  const positions = new Map<number, number>();
  let pos = 0;
  for (const s of included) {
    positions.set(s.source, pos + 1);
    if (s.cloneFrom === "phases") {
      pos += s.itemCaps?.phases ?? 4;
    } else if (s.cloneFrom === "references") {
      pos += NOMINAL_REFERENCE_CLONES;
    } else {
      pos += 1;
    }
  }
  return positions;
}
```

OBS `phases-overview`-detalj: `cloneFrom` är INTE satt på overview-sliden (den klonas
inte), så `pos += itemCaps.phases` gäller bara `phase-detail` (som har
`cloneFrom: "phases"` OCH `itemCaps.activities` etc. men inte `phases`-cap — därför
fallback `?? 4`). Verifiera mot testets förväntade deck-positioner; om
detail-slidens klonantal ska styras av overview-cappen, läs `phases`-cappen från
overview-sliden i `included` istället. Testet är facit.

- [ ] **Steg 4: Kör kalibreringen — trimma konstanterna**

Kör: `npx vitest run src/lib/pptx-template/introspect/__tests__/compute-budgets.test.ts`

Första körningen failar sannolikt — testmeddelandet skriver ut hela tabellen
verklig vs beräknad. Iterera ENDAST på:
1. `CHAR_WIDTH_FACTOR` (0.40–0.60 rimligt spann)
2. `FILL_FACTOR` (0.80–1.00)
3. `maxLines` per token-spec (t.ex. om `{Mål}`-boxen geometriskt rymmer 4 rader men
   facit-budgeten motsvarar 2 — då är 2 fältsemantik, dokumentera varför i specen)

Förväntat efter trimning: PASS. **Om ±10 % inte nås: STOPP — Stefan-gate 3.**
Committa INTE en grön kalibrering som bygger på per-fält-undantag.

- [ ] **Steg 5: Commit**

```bash
git add src/lib/pptx-template/introspect/compute-budgets.ts src/lib/pptx-template/introspect/__tests__/compute-budgets.test.ts
git commit -m "feat(fas2): character budgets from shape geometry + font metrics, calibrated vs Ekan"
```

---

### Task 5: `introspectTemplate()` + CLI + committat Ekan-manifest

**Filer:**
- Skapa: `src/lib/pptx-template/introspect/index.ts`
- Skapa: `scripts/introspect-template.ts`
- Skapa: `templates/anbudsmall-v2.manifest.json` (genererad + handpinnad)
- Ändra: `package.json` (script)
- Test: `src/lib/pptx-template/introspect/__tests__/introspect.test.ts`

- [ ] **Steg 1: Skriv failande test**

```typescript
// src/lib/pptx-template/introspect/__tests__/introspect.test.ts
import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import path from "path";
import { introspectTemplate } from "../index";
import { TemplateManifestSchema } from "../../manifest-types";

const TEMPLATE = path.resolve("templates", "anbudsmall-v2.pptx");

describe("introspectTemplate", () => {
  it("producerar ett schemagiltigt manifest för anbudsmall-v2", async () => {
    const { manifest, warnings } = await introspectTemplate(
      await readFile(TEMPLATE),
      "anbudsmall-v2",
    );
    expect(TemplateManifestSchema.safeParse(manifest).success).toBe(true);
    expect(manifest.slides).toHaveLength(13);
    expect(manifest.excludedSlides.map((e) => e.source).sort((a, b) => a - b))
      .toEqual([8, 9, 10, 15]);
    expect(Object.keys(manifest.budgets)).toHaveLength(8);
    expect(warnings).toEqual([]);
  });
});
```

- [ ] **Steg 2: Kör — FAIL.** `npx vitest run src/lib/pptx-template/introspect/__tests__/introspect.test.ts`

- [ ] **Steg 3: Implementera sammansättningen + CLI**

```typescript
// src/lib/pptx-template/introspect/index.ts
import { readPptxSlides } from "./read-pptx";
import { identifySlides } from "./identify-slides";
import { computeBudgets } from "./compute-budgets";
import { TemplateManifestSchema, type TemplateManifest } from "../manifest-types";

export interface IntrospectionResult {
  manifest: TemplateManifest;
  warnings: string[];
}

export async function introspectTemplate(
  buffer: Buffer,
  name: string,
): Promise<IntrospectionResult> {
  const slides = await readPptxSlides(buffer);
  const { included, excluded } = identifySlides(slides);
  if (included.length === 0) {
    throw new Error(
      "ingen slide matchade någon känd signatur — följer mallen token-konventionen? Se docs/template-authoring.md",
    );
  }
  const { budgets, fieldSlides, warnings } = computeBudgets(slides, included);

  const manifest = TemplateManifestSchema.parse({
    manifestVersion: 1,
    name,
    slides: included,
    budgets,
    fieldSlides,
    excludedSlides: excluded,
  });
  return { manifest, warnings };
}
```

```typescript
// scripts/introspect-template.ts
// CLI: npx tsx scripts/introspect-template.ts <mall.pptx> [namn]
// Skriver <mall>.manifest.json bredvid pptx-filen + rapport till stdout.
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { introspectTemplate } from "../src/lib/pptx-template/introspect";

async function main() {
  const [pptxPath, nameArg] = process.argv.slice(2);
  if (!pptxPath) {
    console.error("Användning: npx tsx scripts/introspect-template.ts <mall.pptx> [namn]");
    process.exit(1);
  }
  const name = nameArg ?? path.basename(pptxPath, ".pptx");
  const { manifest, warnings } = await introspectTemplate(await readFile(pptxPath), name);

  const outPath = pptxPath.replace(/\.pptx$/i, ".manifest.json");
  await writeFile(outPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  console.log(`Manifest: ${outPath}`);
  console.log(`Slides: ${manifest.slides.length} renderas, ${manifest.excludedSlides.length} exkluderas`);
  for (const e of manifest.excludedSlides) console.log(`  - slide ${e.source}: ${e.reason}`);
  console.log("Budgetar:");
  for (const [field, b] of Object.entries(manifest.budgets)) console.log(`  ${field}: ${b}`);
  for (const w of warnings) console.warn(`VARNING: ${w}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Lägg npm-script i `package.json` under `"scripts"`:

```json
"template:introspect": "tsx scripts/introspect-template.ts"
```

- [ ] **Steg 4: Kör testet — PASS.** Sedan generera + pinna Ekan-manifestet:

```bash
npm run template:introspect templates/anbudsmall-v2.pptx
```

Öppna `templates/anbudsmall-v2.manifest.json` och **handpinna två saker** innan commit:
1. `budgets` → ersätt de beräknade värdena med facit-värdena (40/10/120/120/100/100/80/80).
   Manifestet är data; för Ekan gäller de handsatta. Beräkningen var kalibreringen.
2. `fieldSlides` → pinna till FIELD_METADATAs nuvarande värden för beteendeparitet:
   `phases[*].name`: 6, `phases[*].period`: 6, `phases[*].objective`: 7,
   `phases[*].activities[*]`: 7, `phases[*].deliverables[*]`: 7,
   `phases[*].decisions[*]`: 7, `checkpoints[*]`: 11, `certs[*].description`: 18.

- [ ] **Steg 5: Lägg till parity-test som låser det committade manifestet**

Lägg till i `introspect.test.ts`:

```typescript
import { verifyFieldBudgets } from "../../verify-budgets";

it("committat manifest är schemagiltigt och bär facit-budgetarna", async () => {
  const committed = JSON.parse(
    await readFile(path.resolve("templates", "anbudsmall-v2.manifest.json"), "utf8"),
  );
  const parsed = TemplateManifestSchema.parse(committed);
  expect(parsed.budgets).toEqual({
    "phases[*].name": 40,
    "phases[*].period": 10,
    "phases[*].objective": 120,
    "phases[*].activities[*]": 120,
    "phases[*].deliverables[*]": 100,
    "phases[*].decisions[*]": 100,
    "checkpoints[*]": 80,
    "certs[*].description": 80,
  });
  expect(parsed.fieldSlides["certs[*].description"]).toBe(18);
});
```

Kör: `npx vitest run src/lib/pptx-template/introspect/` — Förväntat: PASS (alla).

- [ ] **Steg 6: Commit**

```bash
git add src/lib/pptx-template/introspect/ scripts/introspect-template.ts templates/anbudsmall-v2.manifest.json package.json
git commit -m "feat(fas2): introspectTemplate() + CLI + pinned anbudsmall-v2 manifest"
```

---

### Task 6: Authoring-guide + masterplan-status

**Filer:**
- Skapa: `docs/template-authoring.md`
- Ändra: `docs/superpowers/plans/2026-06-10-utvecklingsplan-master.md` (statusrad fas 2)

- [ ] **Steg 1: Skriv `docs/template-authoring.md`**

Innehåll (skriv ut fullständigt, på svenska):
1. **Konventionen:** en anbudsmall är en PPTX där varje AI-fyllt fält är en
   `{Token}`-placeholder. Tabell över ALLA tokens per slide-typ (kopiera tokensträngarna
   ur `identify-slides.ts` SIGNATURES + `compute-budgets.ts` BUDGET_TOKENS + applicatorernas
   maps — cover, prose×3, phases-overview, phase-detail, quality-assurance, team-pricing,
   requirement-matrix, reference, confidentiality, certifications, footer).
2. **Krav:** budget-bärande boxar måste ha explicit geometri (egen `<a:xfrm>` — rita
   textrutan direkt på sliden, ärv inte från layouten); en slide per semantisk typ
   (dubletter exkluderas som illustrativa); statiska slides utan tokens renderas inte
   (utom första = innehållsförteckning).
3. **Valbara Ekan-specifika förhöjningar** som no-op:ar på andra mallar:
   timeline-highlight på phase-detail (koordinatgated i `phase-detail.ts`),
   footer-breddning (`_footer.ts`). Främmande mallar får statisk tidslinje — inget fel.
4. **Arbetsflöde:** kopiera `templates/anbudsmall-v2.pptx` → styla om (färger, fonter,
   logotyp, bakgrunder) → behåll tokens → ladda upp via `/installningar` → granska
   manifest-preview (hittade fält, beräknade budgetar) → aktivera.
5. **Felsökning:** "okända placeholders" i preview = token stavad fel (em-dash — vs
   bindestreck - är vanligaste felet); saknad budget = boxen ärver geometri från layouten.

- [ ] **Steg 2: Uppdatera masterplanen**

I `2026-06-10-utvecklingsplan-master.md`, direkt under rubriken
`## Fas 2 — Mall & profil som data`, lägg till:

```markdown
> **STATUS 2026-06-12: PÅGÅR.** Detaljplan: [2026-06-12-fas-2-mall-profil-som-data.md](2026-06-12-fas-2-mall-profil-som-data.md).
> Avvikelser från denna masterplan (single-workspace istf org-RLS, två migrationer,
> prose-varianter) är dokumenterade och motiverade i detaljplanens §Designbeslut.
```

- [ ] **Steg 3: Fullt testsvep + commit + PR**

```bash
npx vitest run
npx tsc --noEmit
git add docs/template-authoring.md docs/superpowers/plans/2026-06-10-utvecklingsplan-master.md
git commit -m "docs(fas2): template authoring guide + masterplan status"
git push -u bidsmith fas-2a-introspektion
gh pr create --repo DaVincisfather/bidsmith --base main \
  --title "Fas 2A: PPTX-introspektion — manifest, signaturer, kalibrerade budgetar" \
  --body "Se docs/superpowers/plans/2026-06-12-fas-2-mall-profil-som-data.md §PR A. Ren lib + CLI, inga produktytor. Kalibrering: 8/8 Ekan-budgetar inom ±10 %."
```

Förväntat: alla tester gröna, tsc tyst, PR skapad.

---

# PR B — Manifest-driven generering (`fas-2b-manifest-drift`)

> Branch från `main` EFTER att PR A mergats:
> `git -C ~/projects/bidsmith-main worktree add ~/projects/bidsmith-fas2b -b fas-2b-manifest-drift bidsmith/main`
> (efter `git fetch`), kopiera `.env.local`, `npm install`, `npx vitest run` grönt.

### Task 7: Golden-snapshot av Ekan-renderingen — FÖRE all refaktorering

**Filer:**
- Skapa: `src/lib/pptx-template/__tests__/fixtures/golden-sections.ts`
- Skapa: `src/lib/pptx-template/__tests__/golden-render.test.ts`
- Skapa: `src/lib/pptx-template/__tests__/golden/anbudsmall-v2.golden.json` (genererad)

Golden-testet är fasens viktigaste grind: Ekan-mallen ska rendera BITIDENTISKT
(texter + geometri per slide) före och efter manifest-refaktorn.

- [ ] **Steg 1: Bryt ut sections-fixturen**

`bid-export-e2e.test.ts` har redan en komplett, deterministisk uppsättning sections
(cover, understanding×3, phases, quality, team, requirement-matrix, reference,
confidentiality, certifications). Flytta dess fixture-data till
`__tests__/fixtures/golden-sections.ts` med export
`export const GOLDEN_SECTIONS: BidSection[]` och
`export const GOLDEN_MASTER: MasterContext` (samma värden som e2e-testet använder —
flytta, ändra inte), och importera dem i `bid-export-e2e.test.ts` därifrån.

Kör: `npx vitest run src/lib/pptx-template/__tests__/bid-export-e2e.test.ts`
Förväntat: PASS (oförändrat beteende efter utbrytningen).

- [ ] **Steg 2: Skriv golden-testet med uppdaterings-flagga**

```typescript
// src/lib/pptx-template/__tests__/golden-render.test.ts
import { describe, it, expect } from "vitest";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";
import { renderTemplate } from "../loader";
import { GOLDEN_SECTIONS, GOLDEN_MASTER } from "./fixtures/golden-sections";

const GOLDEN_PATH = path.resolve(
  "src/lib/pptx-template/__tests__/golden/anbudsmall-v2.golden.json",
);
const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";

interface SlideSnapshot {
  /** Alla <a:t>-texter i dokumentordning */
  texts: string[];
  /** Alla <a:off>/<a:ext>-attribut i dokumentordning — fångar geometri-mutationer
   *  (timeline-highlight, footer-breddning) */
  xfrm: { x: string; y: string; cx: string; cy: string }[];
}

async function snapshotRender(): Promise<SlideSnapshot[]> {
  const buffer = await renderTemplate("anbudsmall-v2", GOLDEN_SECTIONS, GOLDEN_MASTER);
  const zip = await JSZip.loadAsync(buffer);
  const parser = new DOMParser();

  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => slideNo(a) - slideNo(b));

  const snapshots: SlideSnapshot[] = [];
  for (const name of slideNames) {
    const doc = parser.parseFromString(await zip.file(name)!.async("string"), "application/xml");
    const texts: string[] = [];
    const tNodes = doc.getElementsByTagNameNS(A_NS, "t");
    for (let i = 0; i < tNodes.length; i++) texts.push(tNodes[i].textContent ?? "");
    const xfrm: SlideSnapshot["xfrm"] = [];
    const offs = doc.getElementsByTagNameNS(A_NS, "off");
    for (let i = 0; i < offs.length; i++) {
      const off = offs[i];
      const ext = (off.parentNode as Element | null)?.getElementsByTagNameNS(A_NS, "ext")[0];
      xfrm.push({
        x: off.getAttribute("x") ?? "",
        y: off.getAttribute("y") ?? "",
        cx: ext?.getAttribute("cx") ?? "",
        cy: ext?.getAttribute("cy") ?? "",
      });
    }
    snapshots.push({ texts, xfrm });
  }
  return snapshots;
}

function slideNo(name: string): number {
  return Number(name.match(/slide(\d+)\.xml$/)![1]);
}

describe("golden render — anbudsmall-v2 bitparitet", () => {
  it("matchar committad golden-snapshot (GOLDEN_UPDATE=1 för att regenerera)", async () => {
    const actual = await snapshotRender();
    if (process.env.GOLDEN_UPDATE === "1") {
      await writeFile(GOLDEN_PATH, JSON.stringify(actual, null, 2) + "\n", "utf8");
      return;
    }
    const golden = JSON.parse(await readFile(GOLDEN_PATH, "utf8"));
    expect(actual).toEqual(golden);
  });
});
```

OBS: golden-loadern kräver `template_configs`-mock? NEJ — `renderTemplate` läser inte
budgetar (de används före rendering, i bundlarna). Ingen Supabase-mock behövs här.

- [ ] **Steg 3: Generera golden + verifiera determinism**

```bash
GOLDEN_UPDATE=1 npx vitest run src/lib/pptx-template/__tests__/golden-render.test.ts
npx vitest run src/lib/pptx-template/__tests__/golden-render.test.ts
npx vitest run src/lib/pptx-template/__tests__/golden-render.test.ts
```

(PowerShell: `$env:GOLDEN_UPDATE="1"; npx vitest run ...; Remove-Item Env:GOLDEN_UPDATE`)

Förväntat: körning 2 och 3 PASS — renderingen är deterministisk på text+geometri-nivå.
Om flakigt: identifiera den icke-deterministiska källan (datum?) och frys den i
fixturen — INTE i produktionskoden.

- [ ] **Steg 4: Commit**

```bash
git add src/lib/pptx-template/__tests__/
git commit -m "test(fas2): golden render snapshot of anbudsmall-v2 before manifest refactor"
```

---

### Task 8: Migration `004_templates.sql` (STEFAN-GATE)

**Filer:**
- Skapa: `supabase/migrations/004_templates.sql`

- [ ] **Steg 1: Skriv migrationen**

```sql
-- 004_templates.sql — mallar som data (fas 2, PR B)
-- Appliceras manuellt via Supabase SQL Editor.

create table templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version int not null default 1,
  -- null = bundlad mall som läses från repo-disk (templates/<name>.pptx);
  -- annars sökväg i storage-bucketen bid-templates (skapas i migration 005)
  storage_path text,
  manifest jsonb not null,
  created_at timestamptz not null default now(),
  unique (name, version)
);

alter table templates enable row level security;
create policy templates_authenticated on templates
  for all to authenticated using (true) with check (true);

alter table workspace_settings
  add column active_template_id uuid references templates(id);

-- Vilken mall bidet genererades mot — export/editor måste använda samma
-- (budgetarna beräknades för den). null = legacy-bid → anbudsmall-v2 v1.
alter table bids
  add column template_id uuid references templates(id);

-- Seeda den bundlade Ekan-mallen ur templates/anbudsmall-v2.manifest.json (PR A).
-- VIKTIGT: klistra in HELA manifest-filens innehåll som jsonb-literal nedan.
insert into templates (name, version, storage_path, manifest) values (
  'anbudsmall-v2',
  1,
  null,
  $manifest$
  __KLISTRA_IN_INNEHÅLLET_I_templates/anbudsmall-v2.manifest.json_HÄR__
  $manifest$::jsonb
);

update workspace_settings
  set active_template_id = (
    select id from templates where name = 'anbudsmall-v2' and version = 1
  );
```

Ersätt `__KLISTRA_IN_...__` med det faktiska JSON-innehållet (dollar-quoted så
citattecken i manifestet inte behöver escapas). `template_configs` lämnas orörd
(applicerad i prod) men slutar läsas efter Task 11 — droppas i senare städmigration.

- [ ] **Steg 2: Commit + STEFAN-GATE**

```bash
git add supabase/migrations/004_templates.sql
git commit -m "feat(fas2): migration 004 — templates table, active_template_id, bids.template_id"
```

**STOPP — Stefan applicerar migrationen i Supabase SQL Editor innan Task 9:s
integrationssteg verifieras.** (Tasks 9–12 kan implementeras med mockade tester
under tiden; det är `npm run dev`-röken i Task 12 som kräver applicerad migration.)

---

### Task 9: Template-store — DB + Storage med disk-fallback

**Filer:**
- Skapa: `src/lib/pptx-template/template-store.ts`
- Test: `src/lib/pptx-template/__tests__/template-store.test.ts`

- [ ] **Steg 1: Skriv failande test** (mocka Supabase enligt mönstret i
`budget-loader.test.ts` — `vi.mock("@/lib/supabase")` med kedjad `from().select().eq().single()`;
för storage-fallet mocka `storage.from().download()` som returnerar en Blob):

```typescript
// src/lib/pptx-template/__tests__/template-store.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "path";

const single = vi.fn();
const maybeSingle = vi.fn();
const download = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single,
          eq: () => ({ single }),
          maybeSingle,
        }),
        limit: () => ({ maybeSingle }),
        maybeSingle,
      }),
    }),
    storage: { from: () => ({ download }) },
  }),
}));

import { loadTemplate, clearTemplateCache } from "../template-store";

const MANIFEST = {
  manifestVersion: 1,
  name: "anbudsmall-v2",
  slides: [{ source: 1, type: "cover", placeholders: [] }],
  budgets: { "phases[*].objective": 120 },
  fieldSlides: { "phases[*].objective": 7 },
  excludedSlides: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  clearTemplateCache();
});

describe("loadTemplate", () => {
  it("bundlad mall (storage_path null) → repo-disk-sökväg", async () => {
    single.mockResolvedValue({
      data: {
        id: "00000000-0000-0000-0000-000000000001",
        name: "anbudsmall-v2",
        version: 1,
        storage_path: null,
        manifest: MANIFEST,
      },
      error: null,
    });
    const tpl = await loadTemplate("00000000-0000-0000-0000-000000000001");
    expect(tpl.templateFile).toBe(path.resolve("templates", "anbudsmall-v2.pptx"));
    expect(tpl.manifest.budgets["phases[*].objective"]).toBe(120);
    expect(download).not.toHaveBeenCalled();
  });

  it("cachear per id — andra anropet träffar inte DB", async () => {
    single.mockResolvedValue({
      data: { id: "00000000-0000-0000-0000-000000000001", name: "anbudsmall-v2",
              version: 1, storage_path: null, manifest: MANIFEST },
      error: null,
    });
    await loadTemplate("00000000-0000-0000-0000-000000000001");
    await loadTemplate("00000000-0000-0000-0000-000000000001");
    expect(single).toHaveBeenCalledTimes(1);
  });

  it("saknad rad → TemplateMissingError", async () => {
    single.mockResolvedValue({ data: null, error: { code: "PGRST116", message: "no rows" } });
    await expect(loadTemplate("00000000-0000-0000-0000-00000000dead")).rejects.toThrow(
      /templates-rad saknas/,
    );
  });

  it("ogiltigt manifest → InvalidManifestError", async () => {
    single.mockResolvedValue({
      data: { id: "x", name: "x", version: 1, storage_path: null, manifest: { trasigt: true } },
      error: null,
    });
    await expect(loadTemplate("x")).rejects.toThrow(/matchar inte TemplateManifestSchema/);
  });

  it("uppladdad mall (storage_path satt) → laddar ner till tmp", async () => {
    single.mockResolvedValue({
      data: { id: "id-2", name: "kundmall", version: 1,
              storage_path: "kundmall/v1.pptx", manifest: { ...MANIFEST, name: "kundmall" } },
      error: null,
    });
    download.mockResolvedValue({
      data: new Blob([Buffer.from("PK-fake")]),
      error: null,
    });
    const tpl = await loadTemplate("id-2");
    expect(download).toHaveBeenCalledWith("kundmall/v1.pptx");
    expect(tpl.templateFile).toMatch(/kundmall.*v1\.pptx$/);
  });
});
```

Kör: `npx vitest run src/lib/pptx-template/__tests__/template-store.test.ts` — FAIL.

- [ ] **Steg 2: Implementera**

```typescript
// src/lib/pptx-template/template-store.ts
import { mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import os from "os";
import path from "path";
import { createServiceClient } from "@/lib/supabase";
import { TemplateManifestSchema, type TemplateManifest } from "./manifest-types";

export const TEMPLATE_BUCKET = "bid-templates";

export class TemplateMissingError extends Error {
  constructor(ref: string) {
    super(`templates-rad saknas (${ref}) — applicera migration 004 eller ladda upp mallen`);
    this.name = "TemplateMissingError";
  }
}

export class InvalidManifestError extends Error {
  constructor(ref: string, cause: unknown) {
    super(`templates.manifest för ${ref} matchar inte TemplateManifestSchema: ${String(cause)}`);
    this.name = "InvalidManifestError";
  }
}

export interface LoadedTemplate {
  id: string;
  name: string;
  version: number;
  manifest: TemplateManifest;
  /** Absolut sökväg till lokal .pptx (bundlad i repo eller nedladdad till tmp) */
  templateFile: string;
}

// Samma cachepolicy som budget-loader: lyckade laddningar cachas, fel cachas inte.
const cache = new Map<string, LoadedTemplate>();

export function clearTemplateCache(id?: string): void {
  if (id === undefined) cache.clear();
  else cache.delete(id);
}

interface TemplateRow {
  id: string;
  name: string;
  version: number;
  storage_path: string | null;
  manifest: unknown;
}

export async function loadTemplate(templateId: string): Promise<LoadedTemplate> {
  const cached = cache.get(templateId);
  if (cached) return cached;

  // Service-klienten av samma skäl som budget-loader: anropas utanför
  // Next:s request-scope (evals, tsx-skript, worker i fas 3).
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("templates")
    .select("id, name, version, storage_path, manifest")
    .eq("id", templateId)
    .single();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Supabase query failed for templates(id='${templateId}'): ${error.message}`);
  }
  if (!data) throw new TemplateMissingError(`id='${templateId}'`);

  const tpl = await materialize(data as TemplateRow);
  cache.set(templateId, tpl);
  return tpl;
}

/** Legacy-bids (template_id null) och fallback: ladda per namn+version. */
export async function loadTemplateByName(
  name: string,
  version = 1,
): Promise<LoadedTemplate> {
  const cacheKey = `${name}@${version}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("templates")
    .select("id, name, version, storage_path, manifest")
    .eq("name", name)
    .eq("version", version)
    .single();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Supabase query failed for templates(name='${name}'): ${error.message}`);
  }
  if (!data) throw new TemplateMissingError(`name='${name}' v${version}`);

  const tpl = await materialize(data as TemplateRow);
  cache.set(cacheKey, tpl);
  cache.set(tpl.id, tpl);
  return tpl;
}

async function materialize(row: TemplateRow): Promise<LoadedTemplate> {
  const ref = `${row.name} v${row.version}`;
  const parsed = TemplateManifestSchema.safeParse(row.manifest);
  if (!parsed.success) throw new InvalidManifestError(ref, parsed.error.message);

  let templateFile: string;
  if (row.storage_path === null) {
    // Bundlad mall — repo-disk, samma resolution som gamla registryt.
    templateFile = path.resolve("templates", `${row.name}.pptx`);
  } else {
    templateFile = await downloadToTmp(row);
  }

  return {
    id: row.id,
    name: row.name,
    version: row.version,
    manifest: parsed.data,
    templateFile,
  };
}

async function downloadToTmp(row: TemplateRow): Promise<string> {
  const dir = path.join(os.tmpdir(), "bidsmith-templates");
  const file = path.join(dir, `${row.name}-v${row.version}.pptx`);
  // Append-only versionering (unique(name, version)) gör tmp-filen immutable —
  // finns den redan är den korrekt.
  if (existsSync(file)) return file;

  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(TEMPLATE_BUCKET)
    .download(row.storage_path!);
  if (error || !data) {
    throw new Error(
      `kunde inte ladda ner mall '${row.name}' från storage (${row.storage_path}): ${error?.message ?? "tom respons"}`,
    );
  }
  await mkdir(dir, { recursive: true });
  await writeFile(file, Buffer.from(await data.arrayBuffer()));
  return file;
}
```

- [ ] **Steg 3: Kör testet — PASS.** `npx vitest run src/lib/pptx-template/__tests__/template-store.test.ts`

- [ ] **Steg 4: Commit**

```bash
git add src/lib/pptx-template/template-store.ts src/lib/pptx-template/__tests__/template-store.test.ts
git commit -m "feat(fas2): template store — DB manifest + storage download with bundled disk fallback"
```

---

### Task 10: Manifest-driven rendering (loader + prose-variant)

**Filer:**
- Ändra: `src/lib/pptx-template/loader.ts` (signatur + slide-källa)
- Ändra: `src/lib/pptx-template/types.ts` (`ApplicatorContext.variant`)
- Ändra: `src/lib/pptx-template/applicators/prose.ts` (dispatch på variant)
- Ändra: `src/lib/pptx-template/registry.ts` (avvecklas till deprecated-stub)
- Ändra: `src/lib/pptx-template/__tests__/loader.test.ts`, `bid-export-e2e.test.ts`,
  `golden-render.test.ts`, `smoke.test.ts` (anropssätt)
- Ta bort: `src/lib/pptx-template/__tests__/registry.test.ts`

- [ ] **Steg 1: Ändra `renderTemplate` till manifest-form**

Ny signatur — behåll exakt samma renderingslogik, byt bara konfigurationskällan:

```typescript
// loader.ts — ersätt registry-import + signatur:
import type { LoadedTemplate } from "./template-store";
import type { ManifestSlide } from "./manifest-types";

export async function renderTemplate(
  tpl: Pick<LoadedTemplate, "manifest" | "templateFile">,
  sections: BidSection[],
  master: MasterContext,
): Promise<Buffer> {
  const templateDir = path.dirname(tpl.templateFile);
  const templateFile = path.basename(tpl.templateFile);
  // ... (oförändrat: Automizer-setup)
  for (const slideCfg of tpl.manifest.slides) {
    // oförändrad loop — SlideConfig och ManifestSlide är strukturellt kompatibla;
    // skicka med variant i ApplicatorContext:
    const cb = applicatorFor(slideCfg, {
      sections, master, slideNum: outIdx, totalSlides,
      sourceSlide: slideCfg.source,
      ...(slideCfg.variant ? { variant: slideCfg.variant } : {}),
      ...(slideCfg.cloneFrom ? { cloneIndex: i } : {}),
    });
    // ...
  }
}
```

`applicatorFor(slideCfg: ManifestSlide, ctx)` — switchen är oförändrad (samma typer).
`countOutputSlides`/`getCloneItems` oförändrade (läser `manifest.slides` istället).
I `types.ts`: lägg till `variant?: "kunden-idag" | "uppdraget" | "vision";` i
`ApplicatorContext` (importera `ProseVariant` från `manifest-types.ts`).

- [ ] **Steg 2: Prose-dispatch på variant**

I `prose.ts`, ersätt `buildProseMap`-switchen:

```typescript
function buildProseMap(ctx: ApplicatorContext): Record<string, string> {
  switch (ctx.variant) {
    case "kunden-idag":
      return buildSlide3Map(ctx);
    case "uppdraget":
      return buildSlide4Map(ctx);
    case "vision":
      return buildSlide5Map(ctx);
    default:
      // Manifest utan variant på prose är ett konfigurationsfel — fail loud
      // (identify-slides sätter alltid variant).
      throw new Error(
        `prose-slide (source ${ctx.sourceSlide}) saknar variant i manifestet`,
      );
  }
}
```

- [ ] **Steg 3: Avveckla registryt**

`registry.ts` ersätts i sin helhet med en bundlad-manifest-läsare för tester/evals
som inte vill träffa DB:

```typescript
// registry.ts — DEPRECATED: konfigurationen bor i templates-tabellen (migration 004).
// Kvar endast som läsare av det bundlade manifestet för tester och offline-skript.
import { readFileSync } from "fs";
import path from "path";
import { TemplateManifestSchema, type TemplateManifest } from "./manifest-types";

export function loadBundledManifest(name = "anbudsmall-v2"): TemplateManifest {
  const file = path.resolve("templates", `${name}.manifest.json`);
  return TemplateManifestSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}

export function bundledTemplate(name = "anbudsmall-v2") {
  return {
    manifest: loadBundledManifest(name),
    templateFile: path.resolve("templates", `${name}.pptx`),
  };
}
```

Ta bort `getTemplate`/`listTemplates` och `registry.test.ts`. Sök upp alla
call-sites: `grep -rn "getTemplate\|renderTemplate(" src/` — uppdatera test-filerna
(`loader.test.ts`, `bid-export-e2e.test.ts`, `golden-render.test.ts`) till
`renderTemplate(bundledTemplate(), sections, master)`.

**Interim för kompilerbarhet:** `src/app/api/bids/[id]/export/route.ts` anropar
`renderTemplate("anbudsmall-v2", ...)` — uppdatera den i DENNA task till
`renderTemplate(bundledTemplate(), sections, master)` (beteendeidentiskt: bundlad
mall + manifest med facit-budgetar). Task 12 byter sedan till mall-per-bid via
`loadTemplateForBid`.

- [ ] **Steg 4: GOLDEN-GRINDEN**

```bash
npx vitest run src/lib/pptx-template/
npx tsc --noEmit
```

Förväntat: ALLA gröna — särskilt `golden-render.test.ts` mot den i Task 7 committade
snapshoten (som genererades med registry-vägen). Det är beviset att manifest-vägen är
bitidentisk. Om golden failar: diffen i testutskriften pekar på exakt slide + text/xfrm —
felsök refaktorn, regenerera ALDRIG golden i denna task.

- [ ] **Steg 5: Commit**

```bash
git add -A src/lib/pptx-template/
git commit -m "refactor(fas2): manifest-driven rendering — registry retired, prose dispatches on variant (golden-verified)"
```

---

### Task 11: Korrektorn + generatorn läser manifestet (`BudgetPlan`)

**Filer:**
- Ändra: `src/lib/pptx-template/budget-types.ts` (ny typ `BudgetPlan`)
- Ändra: `src/lib/pptx-template/verify-budgets.ts` (fieldSlides ur plan, labels kvar)
- Ändra: `src/lib/bid-generator/with-budget-retry.ts` (tar `BudgetPlan`)
- Ändra: `src/lib/bid-generator/index.ts` (manifest in, loadBudgets ut)
- Ändra: `src/lib/bid-generator/run-bid-generation.ts` + bundlarna
  (`bundles/{understanding,phases,quality,requirement-matrix,team}.ts`)
- Ta bort: `src/lib/pptx-template/budget-loader.ts` + `budget-loader.test.ts`
- Test: uppdatera `verify-budgets.test.ts`, `with-budget-retry`-tester,
  `run-bid-generation.test.ts`, bundle-tester

- [ ] **Steg 1: Skriv om verify-budgets med failande test först**

I `budget-types.ts`:

```typescript
export interface BudgetPlan {
  budgets: FieldBudgets;
  /** fältsökväg → 1-indexerad deck-slide (ur manifestet; ersätter FIELD_METADATA.slide) */
  fieldSlides: Record<string, number>;
}
```

I `verify-budgets.test.ts`: byt alla anrop till
`verifyFieldBudgets(data, { budgets, fieldSlides })` där `fieldSlides` ges explicit i
varje test (t.ex. `{ "phases[*].objective": 7 }`), och lägg till test:

```typescript
it("fält utan fieldSlides-post verifieras med slide 0 + console.warn", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const { overflows } = verifyFieldBudgets(
    { fritext: "x".repeat(99) },
    { budgets: { fritext: 10 }, fieldSlides: {} },
  );
  expect(overflows[0].slide).toBe(0);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("fritext"));
  warn.mockRestore();
});
```

Kör — FAIL. Implementera i `verify-budgets.ts`:
- Signatur: `verifyFieldBudgets(data: unknown, plan: BudgetPlan)`
- `FIELD_METADATA` byter namn till `FIELD_LABELS: Record<string, string>` (endast
  labelTemplates — sökvägssemantik, mallooberoende; behåll alla åtta poster).
- Slide-numret hämtas ur `plan.fieldSlides[path] ?? 0` med `console.warn` när det
  saknas (samma driftvarnings-filosofi som idag); label ur `FIELD_LABELS[path] ??
  path` (okänt fält får sökvägen som label istället för att skippas — budgetar ur
  manifest ska alltid verifieras).

Kör — PASS.

- [ ] **Steg 2: Trä `BudgetPlan` genom retry + bundles + index**

Mekanisk signaturändring (visa diff för understanding, identisk för phases/quality/
requirement-matrix/team):

```typescript
// with-budget-retry.ts: params-fältet `budgets: FieldBudgets` ersätts av
//   plan: BudgetPlan
// och verifieringsanropet blir verifyFieldBudgets(output, params.plan).
// render-budget-table-anropen i bundlarna läser plan.budgets.

// bundles/understanding.ts (samma mönster i alla fem):
-export async function buildUnderstandingBundle(ctx: BidContext, budgets: FieldBudgets, retryBudget: RetryBudget)
+export async function buildUnderstandingBundle(ctx: BidContext, plan: BudgetPlan, retryBudget: RetryBudget)
// internt: renderBudgetTable(plan.budgets) / withBudgetRetry({ ..., plan, ... })
```

```typescript
// index.ts:
-export async function generateAllSections(ctx, templateName: string, onSectionComplete?)
+export async function generateAllSections(ctx, manifest: TemplateManifest, onSectionComplete?)
-  const budgets = await loadBudgets(templateName);
+  const plan: BudgetPlan = { budgets: manifest.budgets, fieldSlides: manifest.fieldSlides };
// och alla fem bundle-anrop får plan istället för budgets.
```

```typescript
// run-bid-generation.ts:
-export async function runBidGeneration(supabase, bidId, ctx, templateName: string)
+export async function runBidGeneration(supabase, bidId, ctx, template: LoadedTemplate)
// generateAllSections(ctx, template.manifest, ...)
```

Ta bort `budget-loader.ts` + dess test. Uppdatera mockarna i
`run-bid-generation.test.ts` och bundle-testerna (de mockar `loadBudgets` idag →
skicka in ett manifest-/plan-objekt direkt istället; mindre mockyta = bättre).

**Interim för kompilerbarhet (ersätts i Task 12):**
- `runBidGeneration` typas i denna task som
  `template: { manifest: TemplateManifest }` — det är allt den behöver för
  `generateAllSections` — och `src/app/api/bids/route.ts` skickar
  `bundledTemplate()`. Task 12 breddar till `LoadedTemplate` när
  `bids.template_id` ska sättas.
- `src/app/bids/[id]/page.tsx`: `loadBudgets("anbudsmall-v2")` →
  `loadBundledManifest().budgets`. Task 12 byter till mall-per-bid.

- [ ] **Steg 3: Verifiera**

```bash
npx vitest run
npx tsc --noEmit
grep -rn "loadBudgets\|template_configs" src/
```

Förväntat: vitest grönt, tsc tyst. Grep får ENDAST träffa migrations-SQL och ev.
plan-dokument — ingen produktkod läser `template_configs` längre.
(`src/app/bids/[id]/page.tsx` åtgärdas i Task 12 — har den kvar `loadBudgets` här,
gör Task 12 först klart innan grep-kontrollen bockas av.)

- [ ] **Steg 4: Commit**

```bash
git add -A src/lib/
git commit -m "refactor(fas2): BudgetPlan from manifest through corrector + bundles, budget-loader retired"
```

---

### Task 12: Call-sites — aktiv mall, `bids.template_id`, export/editor

**Filer:**
- Skapa: `src/lib/pptx-template/active-template.ts`
- Ändra: `src/app/api/bids/route.ts` (aktiv mall → bid-rad → generering)
- Ändra: `src/app/api/bids/[id]/export/route.ts` (mall via `bid.template_id`)
- Ändra: `src/app/bids/[id]/page.tsx` (budgetar via mallens manifest)
- Test: `src/lib/pptx-template/__tests__/active-template.test.ts` + uppdaterade route-tester

- [ ] **Steg 1: `active-template.ts` med test (TDD som Task 9)**

```typescript
// src/lib/pptx-template/active-template.ts
import { createServiceClient } from "@/lib/supabase";
import { loadTemplate, loadTemplateByName, type LoadedTemplate } from "./template-store";

/**
 * Aktiv mall = workspace_settings.active_template_id.
 * Saknas pekaren (färsk install, migration 004 ej seedad klart) →
 * bundlade anbudsmall-v2 v1 så flödet aldrig är dött.
 */
export async function loadActiveTemplate(): Promise<LoadedTemplate> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("workspace_settings")
    .select("active_template_id")
    .limit(1)
    .maybeSingle();

  if (data?.active_template_id) return loadTemplate(data.active_template_id);
  return loadTemplateByName("anbudsmall-v2", 1);
}

/** Mall för ett existerande bid — legacy-bids (null) får anbudsmall-v2 v1. */
export async function loadTemplateForBid(
  templateId: string | null,
): Promise<LoadedTemplate> {
  if (templateId) return loadTemplate(templateId);
  return loadTemplateByName("anbudsmall-v2", 1);
}
```

Test: mocka som i Task 9; tre fall (pekare satt → loadTemplate(id); pekare null →
byName-fallback; loadTemplateForBid(null) → byName-fallback).

- [ ] **Steg 2: Trä genom routes**

`src/app/api/bids/route.ts` (POST):

```typescript
// före after()-anropet:
const template = await loadActiveTemplate();
// bid-insert får template_id: template.id
// och: after(() => runBidGeneration(supabase, bid.id, ctx, template));
```

`src/app/api/bids/[id]/export/route.ts`: hämta `template_id` i bid-selecten →
`const template = await loadTemplateForBid(bid.template_id);` →
`renderTemplate(template, sections, master)`.

`src/app/bids/[id]/page.tsx`: ersätt `loadBudgets("anbudsmall-v2")` med
`(await loadTemplateForBid(bid.template_id)).manifest.budgets` (selecten på bids
utökas med `template_id`).

- [ ] **Steg 3: Verifiera (kräver applicerad migration 004 — Stefan-gate)**

```bash
npx vitest run && npx tsc --noEmit
npm run dev
```

Rök manuellt mot dev-servern: skapa anbud på befintlig analys → generering går igenom →
`bids.template_id` satt (kolla i Supabase) → exportera PPTX → öppna i PowerPoint,
jämför stickprov mot ett pre-fas-2-anbud. OBS Next.js 16 turbopack: sällan anropade
routes kan ge HTML-404 första anropet — trigga HMR-rebuild innan felsökning.

- [ ] **Steg 4: Commit + PR**

```bash
git add -A
git commit -m "feat(fas2): active template flows through bid create/generate/export/editor via bids.template_id"
git push -u bidsmith fas-2b-manifest-drift
gh pr create --repo DaVincisfather/bidsmith --base main \
  --title "Fas 2B: Manifest-driven generering — templates-tabell, template-store, golden-verifierad paritet" \
  --body "Se detaljplanen §PR B. Golden-snapshot tagen FÖRE refaktorn (Task 7) och grön EFTER (Task 10). Migration 004 applicerad. Ekan-flödet bitidentiskt."
```

---

# PR C — Profil, API och UI (`fas-2c-profil-ui`)

> Branch från `main` EFTER att PR B mergats (worktree `~/projects/bidsmith-fas2c`).

### Task 13: Migration `005_org_profiles.sql` + storage-bucket (STEFAN-GATE)

**Filer:**
- Skapa: `supabase/migrations/005_org_profiles.sql`

- [ ] **Steg 1: Skriv migrationen**

```sql
-- 005_org_profiles.sql — avsändarprofil + mall-bucket (fas 2, PR C)

create table org_profiles (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  logo_path text,
  -- {"primary":"#7A1F2B","accent":"#0E7C7B"} — används av framtida adapters/UI,
  -- PPTX-färgerna bor i mallen själv
  colors jsonb,
  -- fritext som injiceras i skrivprompternas stabila block
  tonality text,
  boilerplate text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Återanvänd updated_at-triggerfunktionen från 001 (samma som workspace_settings —
-- kontrollera funktionsnamnet i 001_initial_schema.sql och använd det här).
create trigger org_profiles_updated_at
  before update on org_profiles
  for each row execute function set_updated_at();

alter table org_profiles enable row level security;
create policy org_profiles_authenticated on org_profiles
  for all to authenticated using (true) with check (true);

alter table workspace_settings
  add column active_profile_id uuid references org_profiles(id);

-- Storage-bucket för uppladdade mallar (template-store läser, API-routen skriver)
insert into storage.buckets (id, name, public) values ('bid-templates', 'bid-templates', false);

create policy bid_templates_authenticated_all on storage.objects
  for all to authenticated
  using (bucket_id = 'bid-templates') with check (bucket_id = 'bid-templates');
```

OBS: verifiera triggerfunktionens faktiska namn i `001_initial_schema.sql`
(raden `create trigger workspace_settings_updated_at ... execute function <NAMN>()`)
och använd samma. Ingen seed — profil skapas via UI; kod hanterar avsaknad
(fallback = dagens beteende: tomt företagsnamn, ingen ton-injektion).

- [ ] **Steg 2: Commit + STEFAN-GATE**

```bash
git add supabase/migrations/005_org_profiles.sql
git commit -m "feat(fas2): migration 005 — org_profiles, active_profile_id, bid-templates bucket"
```

**STOPP — Stefan applicerar migration 005 innan Task 15–16 röktestas live.**

---

### Task 14: Profilen in i skrivprompten (cachade blocket)

**Filer:**
- Skapa: `src/lib/org-profile.ts`
- Ändra: `src/lib/bid-generator/context.ts` (`BidContext.profile` + formatContext-block)
- Ändra: `src/app/api/bids/route.ts` (ladda aktiv profil in i ctx)
- Ändra: `src/app/api/bids/[id]/export/build-master-context.ts` (companyName ur profil)
- Test: `src/lib/__tests__/org-profile.test.ts`, uppdatera context-/route-tester

- [ ] **Steg 1: `org-profile.ts` med TDD (mockmönster som Task 9)**

```typescript
// src/lib/org-profile.ts
import { createServiceClient } from "@/lib/supabase";

export interface OrgProfile {
  id: string;
  companyName: string;
  logoPath: string | null;
  colors: Record<string, string> | null;
  tonality: string | null;
  boilerplate: string | null;
}

/**
 * Aktiv profil ur workspace_settings.active_profile_id.
 * null när ingen profil skapats — anroparen behåller dagens beteende
 * (tomt företagsnamn, ingen ton-injektion). Ingen cache: profilen kan
 * redigeras mellan genereringar och en stale röst i ett anbud är värre
 * än en extra DB-läsning per generering.
 */
export async function loadActiveProfile(): Promise<OrgProfile | null> {
  const supabase = createServiceClient();
  const { data: ws } = await supabase
    .from("workspace_settings")
    .select("active_profile_id")
    .limit(1)
    .maybeSingle();
  if (!ws?.active_profile_id) return null;

  const { data, error } = await supabase
    .from("org_profiles")
    .select("id, company_name, logo_path, colors, tonality, boilerplate")
    .eq("id", ws.active_profile_id)
    .single();
  if (error || !data) return null;

  return {
    id: data.id,
    companyName: data.company_name,
    logoPath: data.logo_path,
    colors: data.colors,
    tonality: data.tonality,
    boilerplate: data.boilerplate,
  };
}
```

Test: pekare null → null; pekare satt → mappad profil; DB-fel på profilraden → null.

- [ ] **Steg 2: Profilblock i `formatContext` (failande test först)**

I `src/lib/__tests__/`-testet för context (eller nytt test i
`src/lib/bid-generator/__tests__/context.test.ts`):

```typescript
it("prependar avsändarprofil när ctx.profile finns", () => {
  const out = formatContext({ ...baseCtx, profile: {
    id: "p1", companyName: "Testbolaget AB", logoPath: null, colors: null,
    tonality: "Rak, konkret, inga superlativ.", boilerplate: "Grundat 2001 i Göteborg.",
  }});
  expect(out.indexOf("## Avsändarprofil")).toBe(0);
  expect(out).toContain("Testbolaget AB");
  expect(out).toContain("Rak, konkret");
  expect(out.indexOf("## Avsändarprofil")).toBeLessThan(out.indexOf("## Förfrågningsunderlag"));
});

it("oförändrad output utan profil (cache-paritet med legacy)", () => {
  expect(formatContext(baseCtx)).toMatch(/^## Förfrågningsunderlag/);
});
```

Implementera i `context.ts`:

```typescript
import type { OrgProfile } from "@/lib/org-profile";

export interface BidContext {
  // ... befintliga fält oförändrade ...
  /** Avsändarprofil — injiceras FÖRST i cachade systemblocket (stabil per org) */
  profile?: OrgProfile | null;
}

// I formatContext, före return-strängen:
const profileBlock = ctx.profile
  ? `## Avsändarprofil
- Företag: ${ctx.profile.companyName}
${ctx.profile.tonality ? `- Tonalitet (följ denna i all text): ${ctx.profile.tonality}\n` : ""}${ctx.profile.boilerplate ? `- Om bolaget (väv in där det är relevant, hitta inte på utöver detta): ${ctx.profile.boilerplate}\n` : ""}
`
  : "";

return `${profileBlock}## Förfrågningsunderlag (RFP)
...`;  // resten oförändrad
```

Cache-noten (viktig, skriv som kommentar i koden): profilblocket ligger i
`cachedContext` (stabila blocket) — per fas 0-resultatet delar bundlar med olika
scheman ändå aldrig cache, men overflow-/format-retries inom samma bundle får
fortsatt träff eftersom profilen är konstant under genereringen.

- [ ] **Steg 3: Trä genom create-flödet + master-context**

`src/app/api/bids/route.ts`: `const profile = await loadActiveProfile();` →
`ctx.profile = profile`.
`build-master-context.ts`: ersätt den tomma companyName-platshållaren
(kommentaren "companyName comes from workspace_settings in the future") med
`profile?.companyName ?? ""` — funktionen får profilen som parameter från
export-routen (som också anropar `loadActiveProfile()`).
Footern (`{Bolagsnamn}`) och covern får därmed företagsnamnet automatiskt.

- [ ] **Steg 4: Verifiera + commit**

```bash
npx vitest run && npx tsc --noEmit
git add -A src/
git commit -m "feat(fas2): org profile injected into cached system context + master companyName"
```

---

### Task 15: API-routes — mall-upload/aktivering + profil-CRUD

**Filer:**
- Skapa: `src/app/api/templates/route.ts` (GET lista, POST upload+introspektera)
- Skapa: `src/app/api/templates/[id]/activate/route.ts` (POST)
- Skapa: `src/app/api/profiles/route.ts` (GET lista, POST skapa)
- Skapa: `src/app/api/profiles/[id]/route.ts` (PATCH uppdatera)
- Skapa: `src/app/api/profiles/[id]/activate/route.ts` (POST)
- Test: `tests/api/templates.test.ts`, `tests/api/profiles.test.ts`
  (mockmönster från `tests/api/analyze.test.ts`)

Följ befintliga konventioner: `parseBody`/`parseUuidParam` ur `api-helpers.ts`,
auth via `getUserId()` (kasta → 401 som övriga routes), Zod-validering av body.

- [ ] **Steg 1: POST /api/templates (upload → introspektera → spara som ny version)**

```typescript
// src/app/api/templates/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase";
import { getUserId } from "@/lib/org";
import { introspectTemplate } from "@/lib/pptx-template/introspect";
import { TEMPLATE_BUCKET, clearTemplateCache } from "@/lib/pptx-template/template-store";

const MAX_TEMPLATE_SIZE = 20 * 1024 * 1024; // samma tak som document-parser

export async function GET() {
  const supabase = await createClient();
  await getUserId(supabase);
  const { data, error } = await supabase
    .from("templates")
    .select("id, name, version, storage_path, manifest, created_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await getUserId(supabase);

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".pptx")) {
    return NextResponse.json({ error: "ladda upp en .pptx-fil" }, { status: 400 });
  }
  if (file.size > MAX_TEMPLATE_SIZE) {
    return NextResponse.json({ error: "max 20 MB" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.replace(/\.pptx$/i, "").toLowerCase()
    .replace(/[^a-z0-9åäö]+/g, "-").replace(/(^-|-$)/g, "");

  let manifest, warnings;
  try {
    ({ manifest, warnings } = await introspectTemplate(buffer, name));
  } catch (err) {
    return NextResponse.json(
      { error: `mallen kunde inte introspekteras: ${err instanceof Error ? err.message : String(err)}` },
      { status: 422 },
    );
  }

  // Append-only versionering
  const service = createServiceClient();
  const { data: prev } = await service
    .from("templates").select("version").eq("name", name)
    .order("version", { ascending: false }).limit(1).maybeSingle();
  const version = (prev?.version ?? 0) + 1;

  const storagePath = `${name}/v${version}.pptx`;
  const { error: upErr } = await service.storage
    .from(TEMPLATE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: row, error: insErr } = await service
    .from("templates")
    .insert({ name, version, storage_path: storagePath, manifest })
    .select("id")
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  clearTemplateCache();
  return NextResponse.json({ id: row.id, name, version, manifest, warnings });
}
```

OBS: uppladdning AKTIVERAR inte mallen — preview först, aktivering är explicit.

- [ ] **Steg 2: Activate + profil-routes**

`templates/[id]/activate/route.ts`: validera uuid (`parseUuidParam`), kontrollera att
raden finns, `update workspace_settings set active_template_id = id` (service-klient,
`workspace_settings` är en enradstabell — `update ... where id is not null` eller läs
radens id först, samma mönster som befintlig kod använder för tabellen), svara
`{ activated: id }`.

`profiles/route.ts` + `profiles/[id]/route.ts` + `profiles/[id]/activate/route.ts`:
spegelvänd CRUD med Zod-body:

```typescript
const ProfileBodySchema = z.object({
  companyName: z.string().min(1).max(200),
  tonality: z.string().max(2000).nullable().optional(),
  boilerplate: z.string().max(4000).nullable().optional(),
  colors: z.record(z.string(), z.string()).nullable().optional(),
});
```

(logo-upload utgår ur fas 2 — `logo_path` finns i schemat men sätts inte via UI ännu;
notera i Kända begränsningar.)

- [ ] **Steg 3: Route-tester + verifiera + commit**

Tester per route: 401 utan auth, 400 på trasig body/fil, lyckat flöde med mockade
Supabase-klienter (mönster från `tests/api/analyze.test.ts`). Introspektionen mockas
INTE i upload-testet — använd riktiga `templates/anbudsmall-v2.pptx` som testfil
(läs med `readFile`, skapa `File` av buffern) så hela kedjan testas.

```bash
npx vitest run tests/api/ && npx tsc --noEmit
git add src/app/api/templates/ src/app/api/profiles/ tests/api/
git commit -m "feat(fas2): template upload/activate + profile CRUD API routes"
```

---

### Task 16: UI — `/installningar` (mall + profil)

**Filer:**
- Skapa: `src/app/installningar/page.tsx` (server component: hämtar data)
- Skapa: `src/components/settings/TemplateSection.tsx` (client)
- Skapa: `src/components/settings/ProfileSection.tsx` (client)
- Ändra: `src/app/layout.tsx` (nav-länk "Inställningar")

**Designregler (Stefans feedback, bindande):** ingen ny designriktning — återanvänd
appens befintliga komponentmönster, tokens och typografi (burgundy/anvil-stilen från
app-restylen). Funktion före polish. Svenska etiketter.

- [ ] **Steg 1: Sidan + sektionerna**

`page.tsx`: server component som läser mallista (`templates`-tabellen),
`workspace_settings` (aktiva pekare) och profiler, och renderar de två sektionerna
med data som props.

`TemplateSection.tsx` (client):
- Lista: namn, version, skapad, "Aktiv"-badge på `active_template_id`-raden,
  "Aktivera"-knapp på övriga (`POST /api/templates/[id]/activate` → `router.refresh()`).
- Upload: `<input type="file" accept=".pptx">` → `POST /api/templates` (FormData) →
  rendera previewn ur svaret INNAN aktivering:
  - per slide: `source`, `type`(+`variant`), antal placeholders
  - exkluderade slides med `reason`
  - budgettabell (`fieldPath` → tecken)
  - `warnings` i varningsfärg
- Felrendering: API:ets `error`-sträng visas inline (422 = konventionsfel med
  hänvisning till `docs/template-authoring.md`).

`ProfileSection.tsx` (client):
- Lista profiler med "Aktiv"-badge + aktivera-knapp (samma mönster).
- Formulär (skapa/redigera): Företagsnamn (required), Tonalitet (textarea,
  hjälptext: "Beskriv rösten — t.ex. 'Rak, konkret, inga superlativ'"),
  Boilerplate (textarea, hjälptext: "Fakta om bolaget som AI:n får använda —
  den hittar inte på utöver detta").
- Submit → POST/PATCH → `router.refresh()`.

- [ ] **Steg 2: Manuell röktest (kräver migration 005 — Stefan-gate)**

`npm run dev` → `/installningar`:
1. anbudsmall-v2 v1 listas som aktiv
2. ladda upp en kopia av `templates/anbudsmall-v2.pptx` under nytt filnamn →
   preview visar 13 slides, 4 exkluderade, 8 budgetar → aktivera → badge flyttar
3. skapa profil "Ekan Management" med tonalitet → aktivera
4. generera ett anbud → `formatContext`-blocket innehåller profilen (verifiera via
   `ai_call_logs` eller debug-logg), footer/cover visar företagsnamnet

- [ ] **Steg 3: Verifiera + commit**

```bash
npx vitest run && npx tsc --noEmit
git add src/app/installningar/ src/components/settings/ src/app/layout.tsx
git commit -m "feat(fas2): /installningar — template upload with manifest preview, profile management"
```

---

### Task 17: Evals-grind (KOSTAR PENGAR — körs en gång här)

- [ ] **Steg 1: Kör hela eval-sviten**

```bash
npm run eval:analyzer && npm run eval:matcher && npm run eval:bid-generator
```

Förväntat: alla tre gröna mot trösklarna i `evals/thresholds.yaml`.
`eval:bid-generator` är den relevanta (formatContext ändrades i Task 14) — kör den
med en aktiv testprofil satt, så profilblocket faktiskt är med i prompten.
Vid försämring mot tröskel: misstänk profilblockets formulering (instruktionen
"hitta inte på utöver detta" är hallucination-skyddet — kontrollera att
hallucination-dimensionen inte degraderat).

- [ ] **Steg 2: Dokumentera körningen i PR-beskrivningen** (datum, resultat per eval,
kostnad ur `ai_call_logs`).

---

### Task 18: Demo "Testbolaget AB" — fasens framgångskriterium (STEFAN-GATE)

- [ ] **Steg 1 (Stefan): Skapa Testbolaget-mallen.** Kopiera
`templates/anbudsmall-v2.pptx` → PowerPoint → byt färgtema/fonter/logotyp (INTE
tokens) → spara som `testbolaget.pptx`. (Påminnelse: lokala Office substituerar
Aptos → Calibri — välj fonter som finns lokalt.)

- [ ] **Steg 2: Kör demon end-to-end:**
1. `/installningar` → ladda upp `testbolaget.pptx` → preview: 13 slides, 8 budgetar
   (siffrorna AVVIKER från Ekans om geometrin ändrats — det är featuren) → aktivera
2. skapa profil "Testbolaget AB" (egen tonalitet, t.ex. mer formell) → aktivera
3. generera anbud på en befintlig analys → exportera → öppna i PowerPoint:
   Testbolagets design, `{Bolagsnamn}` = "Testbolaget AB", tonen följer profilen
4. växla tillbaka till anbudsmall-v2 + Ekan-profilen → generera → Ekan-flödet
   oförändrat + `npx vitest run` grönt (golden-testet är beviset)

- [ ] **Steg 3: PR + masterplan-status**

Uppdatera masterplanens statusrad för fas 2 till
`KLAR <datum> — demo godkänd, se PR #NN`, committa, push, PR:

```bash
git push -u bidsmith fas-2c-profil-ui
gh pr create --repo DaVincisfather/bidsmith --base main \
  --title "Fas 2C: Avsändarprofil + /installningar — mall & profil som data komplett" \
  --body "Se detaljplanen §PR C. Evals gröna (Task 17), Testbolaget-demo godkänd av Stefan (Task 18)."
```

---

## Självgranskning mot masterplanens framgångskriterier

| Masterplanens kriterium | Täcks av |
|---|---|
| Mallintrospektion: placeholders, geometri, fontstorlekar → manifest | Task 2, 3, 5 |
| Teckenbudget ur geometri+fontmetrik, kalibrerad ±10 % mot Ekan | Task 4 (grind) |
| DB & Storage: templates + org_profiles, migration enligt konvention | Task 8, 13 |
| Generering mot manifest, trelagerskorrektorn parametriserad oförändrad | Task 10, 11 |
| Golden-test: Ekan identisk före/efter | Task 7 (snapshot) + 10 (grind) |
| Profilpaket i systempromptens stabila del (cache-medvetet) | Task 14 |
| UI: uppladdning, manifest-preview, profilformulär | Task 15, 16 |
| Demo Testbolaget AB + Ekan-flödet oförändrat | Task 18 |
| Evals gröna före merge | Task 17 |
