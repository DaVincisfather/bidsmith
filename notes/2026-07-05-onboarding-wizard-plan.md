# Onboarding-wizard för kundmallar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** UI + API som binder ihop redan levererad backend (`proposeInjectionPlan`, `instrumentTemplate`, profil-persistens, #68-rendering) till ett komplett onboarding-flöde för tokenlösa kundmallar.

**Architecture:** Route-baserad wizard (`/installningar/mallar/[id]/onboarding`) med server-persisterat utkast i ny kolumn `templates.onboarding_draft`. Upload auto-detekterar tokenlösa mallar; klassificeringen körs asynkront via `after()` (bid-generationens mönster); varje slot-beslut PATCH:as direkt; complete instrumenterar en kopia och sparar slutprofilen. Spec: `notes/2026-07-05-onboarding-wizard-design.md`.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + Storage), Zod, vitest + @testing-library/react, JSZip/@xmldom (finns).

## Global Constraints

- TypeScript strikt — inga `any` utan motiverad kommentar.
- Varje fil under 300 rader — bryt ut komponenter hellre än att växa.
- UI-copy på svenska; kodkommentarer följer filens befintliga stil (repo:t blandar svenska kommentarer — matcha).
- INGA live-AI-anrop i tester — `classifyForeignSlot` mockas alltid (kostnadstrappan).
- Migrationer: ny fil `012_template_onboarding.sql`, appliceras MANUELLT av Stefan via Supabase SQL Editor — redigera ALDRIG en applicerad migration.
- Modellanrop endast via `MODELS`-roller (redan uppfyllt — `classifyForeignSlot` kör `MODELS.matching`).
- Conventional commits. Checkpoints under autonomt arbete: `chore: checkpoint — ...`.
- Kör tester/npm via PowerShell, inte Bash (Bash-sandboxen ser inte harness-skrivningar på Windows).
- `npm ci` failar på main (lockfile-drift) — använd `npm install` i ny worktree.

## Förberedelse (en gång, före Task 1)

```powershell
git -C C:\Users\stefa\projects\bidsmith-main worktree add ..\bidsmith-onboarding -b feat/onboarding-wizard
Copy-Item C:\Users\stefa\projects\bidsmith-main\.env.local C:\Users\stefa\projects\bidsmith-onboarding\.env.local
cd C:\Users\stefa\projects\bidsmith-onboarding; npm install
npx vitest run src/lib/pptx-template   # grön baslinje
```

Alla paths nedan är relativa `bidsmith-onboarding/`. Verifiera branch före varje commit: `git branch --show-current` → `feat/onboarding-wizard`.

⚠️ Vid städning efteråt: ta bort node_modules-JUNCTIONEN först, verifiera att den är borta, SEDAN `git worktree remove` (junction-footgun raderar annars target-innehållet).

---

### Task 1: Migration 012 + utkast-schema (`draft.ts`)

**Files:**
- Create: `supabase/migrations/012_template_onboarding.sql`
- Create: `src/lib/pptx-template/onboarding/draft.ts`
- Test: `src/lib/pptx-template/onboarding/__tests__/draft.test.ts`

**Interfaces:**
- Consumes: `CAPABILITY_IDS` från `../template-profile`.
- Produces: `OnboardingDraftSchema`/`OnboardingDraft`, `DraftSlot`, `WireframeSlide`, `WireframeShape`, `parseOnboardingDraft(raw)`, `TOKEN_RE` — allt Task 2–11 bygger på.

- [ ] **Step 1: Skriv migrationen**

```sql
-- 012_template_onboarding.sql — onboarding-wizard för kundmallar (slice 5-UI).
-- Appliceras manuellt via Supabase SQL Editor.

-- Främmande mallar kan inte producera ett manifest förrän de onboardats —
-- foreign-raden bär manifest = null tills vidare (profilen är dess sanning).
alter table templates alter column manifest drop not null;

-- none = token-bärande mall (dagens väg, default för alla befintliga rader);
-- needs_onboarding → classifying → draft → onboarded är kundmall-vägen.
alter table templates add column onboarding_status text not null default 'none'
  check (onboarding_status in ('none','needs_onboarding','classifying','draft','onboarded'));

-- Klassificeringsförslaget + användarens slot-beslut (OnboardingDraftSchema i
-- src/lib/pptx-template/onboarding/draft.ts). Även fel-/precount-payloads
-- ({ error } resp. { precount }) bor här — se draft.ts.
alter table templates add column onboarding_draft jsonb;
```

- [ ] **Step 2: Skriv failande test**

```ts
// src/lib/pptx-template/onboarding/__tests__/draft.test.ts
import { describe, it, expect } from "vitest";
import { parseOnboardingDraft, TOKEN_RE } from "../draft";

const validDraft = {
  draftVersion: 1,
  slideSize: { cx: 12192000, cy: 6858000 },
  slots: [
    {
      source: 1,
      shapeIndex: 0,
      shapeText: "Beskriv er metod här",
      token: "{Vår metod}",
      capability: "generic-prose",
      intent: "Beskrivning av leverantörens metod",
      confidence: "high",
      decision: "confirmed",
    },
  ],
  wireframe: [
    {
      source: 1,
      shapes: [
        {
          shapeIndex: 0,
          geometry: { x: 1000, y: 1000, cx: 5000000, cy: 2000000 },
          text: "Beskriv er metod här",
          candidate: true,
        },
      ],
    },
  ],
};

describe("OnboardingDraftSchema", () => {
  it("accepterar ett giltigt utkast", () => {
    expect(parseOnboardingDraft(validDraft).slots[0].token).toBe("{Vår metod}");
  });

  it("avvisar token utan klamrar", () => {
    const bad = structuredClone(validDraft);
    bad.slots[0].token = "Vår metod";
    expect(() => parseOnboardingDraft(bad)).toThrow();
  });

  it("avvisar okänt decision-värde", () => {
    const bad = structuredClone(validDraft);
    (bad.slots[0] as { decision: string }).decision = "maybe";
    expect(() => parseOnboardingDraft(bad)).toThrow();
  });

  it("TOKEN_RE matchar instrumentTemplates kontrakt", () => {
    expect(TOKEN_RE.test("{Namn}")).toBe(true);
    expect(TOKEN_RE.test("{}")).toBe(false);
    expect(TOKEN_RE.test("{a{b}")).toBe(false);
  });
});
```

- [ ] **Step 3: Kör testet — ska faila**

Run: `npx vitest run src/lib/pptx-template/onboarding/__tests__/draft.test.ts`
Expected: FAIL — `Cannot find module '../draft'`

- [ ] **Step 4: Implementera schemat**

```ts
// src/lib/pptx-template/onboarding/draft.ts
import { z } from "zod";
import { CAPABILITY_IDS } from "../template-profile";

/**
 * Onboarding-utkastet — det persisterade tillståndet mellan klassificering och
 * slutförande (templates.onboarding_draft, migration 012). Wizarden läser det,
 * varje slot-beslut PATCH:as in i det, complete bygger injektioner + slutprofil
 * ur det. Zod-validerat åt båda håll (spegling av profile-store-principen).
 *
 * Kolumnen bär även två icke-utkast-payloads som INTE valideras av detta schema:
 * { precount: { slides, candidates } } (satt av upload, läses av startsidan) och
 * { error: string } (satt när klassificeringsjobbet faller). Läsare kollar de
 * nycklarna före parseOnboardingDraft.
 */

/** Samma kontrakt som instrumentTemplates interna validering. */
export const TOKEN_RE = /^\{[^{}]+\}$/;

export const DraftSlotSchema = z.object({
  /** Adressering — speglar ProposedSlot/TokenInjection exakt. */
  source: z.number().int().positive(),
  shapeIndex: z.number().int().nonnegative(),
  /** Shapens befintliga text — visas i panelen som kontext. */
  shapeText: z.string(),
  token: z.string().regex(TOKEN_RE),
  /** Klassificerarens förmåge-gissning — info-etikett i UI, INTE valbar i v1. */
  capability: z.enum(CAPABILITY_IDS),
  intent: z.string().max(500),
  confidence: z.enum(["high", "low"]),
  decision: z.enum(["confirmed", "skipped", "pending"]),
});
export type DraftSlot = z.infer<typeof DraftSlotSchema>;

export const WireframeShapeSchema = z.object({
  shapeIndex: z.number().int().nonnegative(),
  /** EMU ur readPptxSlides; null = ärvd geometri → kan inte placeras rumsligt. */
  geometry: z
    .object({ x: z.number(), y: z.number(), cx: z.number(), cy: z.number() })
    .nullable(),
  /** Trunkerat textutdrag för wireframe-etiketten. */
  text: z.string(),
  /** true = har en DraftSlot (klickbar i wireframen). */
  candidate: z.boolean(),
});
export type WireframeShape = z.infer<typeof WireframeShapeSchema>;

export const WireframeSlideSchema = z.object({
  source: z.number().int().positive(),
  shapes: z.array(WireframeShapeSchema),
});
export type WireframeSlide = z.infer<typeof WireframeSlideSchema>;

export const OnboardingDraftSchema = z.object({
  draftVersion: z.literal(1),
  /** Slide-yta i EMU (presentation.xml sldSz) — wireframens viewBox. */
  slideSize: z.object({
    cx: z.number().int().positive(),
    cy: z.number().int().positive(),
  }),
  slots: z.array(DraftSlotSchema),
  wireframe: z.array(WireframeSlideSchema).min(1),
});
export type OnboardingDraft = z.infer<typeof OnboardingDraftSchema>;

export function parseOnboardingDraft(raw: unknown): OnboardingDraft {
  return OnboardingDraftSchema.parse(raw);
}
```

- [ ] **Step 5: Kör testet — ska passa**

Run: `npx vitest run src/lib/pptx-template/onboarding/__tests__/draft.test.ts`
Expected: PASS (4 tester)

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations/012_template_onboarding.sql src/lib/pptx-template/onboarding/draft.ts src/lib/pptx-template/onboarding/__tests__/draft.test.ts
git commit -m "feat(onboarding): migration 012 + onboarding-draft schema"
```

---

### Task 2: Slide-storlek ur presentation.xml (`slide-size.ts`)

**Files:**
- Create: `src/lib/pptx-template/onboarding/slide-size.ts`
- Test: `src/lib/pptx-template/onboarding/__tests__/slide-size.test.ts`

**Interfaces:**
- Consumes: `buildMiniPptx` från `../../introspect/__tests__/mini-pptx` (testet).
- Produces: `readSlideSize(buffer: Buffer): Promise<{ cx: number; cy: number }>`, `DEFAULT_SLIDE_SIZE` — används av Task 4 (propose-jobbet).

- [ ] **Step 1: Skriv failande test**

```ts
// src/lib/pptx-template/onboarding/__tests__/slide-size.test.ts
import { describe, it, expect } from "vitest";
import { buildMiniPptx } from "../../introspect/__tests__/mini-pptx";
import { readSlideSize, DEFAULT_SLIDE_SIZE } from "../slide-size";

const SLIDE = `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree>
  </p:spTree></p:cSld></p:sld>`;

describe("readSlideSize", () => {
  it("läser sldSz ur presentation.xml", async () => {
    // mini-pptx:ens presentationXmlOverride — bygg en med explicit sldSz.
    const presentationXml = `<?xml version="1.0"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>
  <p:sldSz cx="9144000" cy="6858000"/>
</p:presentation>`;
    const pptx = await buildMiniPptx(SLIDE, presentationXml);
    expect(await readSlideSize(pptx)).toEqual({ cx: 9144000, cy: 6858000 });
  });

  it("faller tillbaka till 16:9-default när sldSz saknas", async () => {
    const pptx = await buildMiniPptx(SLIDE); // default-presentation.xml utan sldSz
    expect(await readSlideSize(pptx)).toEqual(DEFAULT_SLIDE_SIZE);
  });
});
```

OBS: om `buildMiniPptx`:s default-presentation.xml redan innehåller `<p:sldSz>` — justera fallback-testet till en override UTAN sldSz i stället. Läs `mini-pptx.ts` först.

- [ ] **Step 2: Kör — ska faila** (`Cannot find module '../slide-size'`)

- [ ] **Step 3: Implementera**

```ts
// src/lib/pptx-template/onboarding/slide-size.ts
import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom"; // samma import som instrument-template.ts — verifiera och matcha

const P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";

/** 16:9-standard (12192000×6858000 EMU) — vår egen anbudsmall-v2:s format. */
export const DEFAULT_SLIDE_SIZE = { cx: 12192000, cy: 6858000 };

/**
 * Läser slide-ytan (EMU) ur ppt/presentation.xml <p:sldSz>. Wireframen ritas i
 * EMU-koordinater direkt (SVG viewBox), så det här är den enda dimensionsdatan
 * UI:t behöver. Fallback till 16:9 när attributet saknas/är trasigt — en fel
 * proportion är kosmetisk, inte korrupt.
 */
export async function readSlideSize(
  buffer: Buffer,
): Promise<{ cx: number; cy: number }> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("ppt/presentation.xml")?.async("string");
  if (!xml) return DEFAULT_SLIDE_SIZE;
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const el = doc.getElementsByTagNameNS(P_NS, "sldSz")[0];
  const cx = Number(el?.getAttribute("cx"));
  const cy = Number(el?.getAttribute("cy"));
  return Number.isFinite(cx) && cx > 0 && Number.isFinite(cy) && cy > 0
    ? { cx, cy }
    : DEFAULT_SLIDE_SIZE;
}
```

- [ ] **Step 4: Kör — ska passa**

- [ ] **Step 5: Commit** — `feat(onboarding): readSlideSize ur presentation.xml`

---

### Task 3: Utkast-logiken — buildDraft / applyDecision / buildInjections / buildFinalProfile

**Files:**
- Create: `src/lib/pptx-template/onboarding/draft-logic.ts`
- Test: `src/lib/pptx-template/onboarding/__tests__/draft-logic.test.ts`

**Interfaces:**
- Consumes: `OnboardingDraft`/`DraftSlot`/`TOKEN_RE` (Task 1), `ProposedSlot` från `./propose-injection-plan`, `SlideShapes` från `../introspect/read-pptx`, `TokenInjection` från `../instrument/instrument-template`, `parseTemplateProfile`/`TemplateProfile` från `../template-profile`.
- Produces:
  - `buildDraft(slots: ProposedSlot[], slides: SlideShapes[], slideSize: {cx,cy}): OnboardingDraft`
  - `applyDecision(draft, d: SlotDecisionInput): { ok: true; draft: OnboardingDraft } | { ok: false; error: string }` med `SlotDecisionInput = { source: number; shapeIndex: number; decision: "confirmed"|"skipped"|"pending"; token?: string; intent?: string }`
  - `buildInjections(draft): TokenInjection[]`
  - `buildFinalProfile(draft, meta: { templateId: string; name: string; version: number }): TemplateProfile` — kastar `Error("minst en textruta måste bekräftas")` vid noll bekräftade.

- [ ] **Step 1: Skriv failande tester**

```ts
// src/lib/pptx-template/onboarding/__tests__/draft-logic.test.ts
import { describe, it, expect } from "vitest";
import type { SlideShapes } from "../../introspect/read-pptx";
import type { ProposedSlot } from "../propose-injection-plan";
import {
  buildDraft,
  applyDecision,
  buildInjections,
  buildFinalProfile,
} from "../draft-logic";

const SIZE = { cx: 12192000, cy: 6858000 };

function shape(text: string, geometry = { x: 0, y: 0, cx: 100, cy: 100 }) {
  return {
    paragraphs: [text],
    tokens: [],
    geometry,
    fontSizePt: 18,
    lineSpacingPct: null,
    autofit: null,
  };
}

const slides = [
  { source: 1, shapes: [shape("Rubrik"), shape("Beskriv er metod")], tokens: [], images: { placed: 0, placeholders: 0 } },
  { source: 2, shapes: [shape("Statisk footer")], tokens: [], images: { placed: 0, placeholders: 0 } },
] as unknown as SlideShapes[];

const proposal: ProposedSlot[] = [
  {
    source: 1,
    shapeIndex: 1,
    shapeText: "Beskriv er metod",
    token: "{Metod}",
    capability: "understanding",
    intent: "Leverantörens metodbeskrivning",
    confidence: "high",
  },
  {
    source: 2,
    shapeIndex: 0,
    shapeText: "Statisk footer",
    token: "{Footer}",
    capability: "generic-prose",
    intent: "Oklart",
    confidence: "low",
  },
];

describe("buildDraft", () => {
  it("hög konfidens förbekräftas, låg blir pending", () => {
    const draft = buildDraft(proposal, slides, SIZE);
    expect(draft.slots[0].decision).toBe("confirmed");
    expect(draft.slots[1].decision).toBe("pending");
  });

  it("wireframen täcker ALLA slides och markerar kandidater", () => {
    const draft = buildDraft(proposal, slides, SIZE);
    expect(draft.wireframe).toHaveLength(2);
    expect(draft.wireframe[0].shapes[0].candidate).toBe(false); // Rubrik
    expect(draft.wireframe[0].shapes[1].candidate).toBe(true);
  });

  it("trunkerar wireframe-text till 120 tecken", () => {
    const long = "x".repeat(500);
    const draft = buildDraft(proposal, [
      { ...slides[0], shapes: [shape(long), shape("Beskriv er metod")] },
      slides[1],
    ] as unknown as SlideShapes[], SIZE);
    expect(draft.wireframe[0].shapes[0].text).toHaveLength(120);
  });
});

describe("applyDecision", () => {
  const draft = buildDraft(proposal, slides, SIZE);

  it("bekräftar och redigerar token + intent", () => {
    const res = applyDecision(draft, {
      source: 2, shapeIndex: 0, decision: "confirmed",
      token: "{Sammanfattning}", intent: "Kort sammanfattning av anbudet",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const slot = res.draft.slots.find((s) => s.source === 2)!;
      expect(slot.token).toBe("{Sammanfattning}");
      expect(slot.decision).toBe("confirmed");
    }
  });

  it("avvisar okänd adress", () => {
    const res = applyDecision(draft, { source: 9, shapeIndex: 0, decision: "skipped" });
    expect(res.ok).toBe(false);
  });

  it("avvisar ogiltigt tokenformat", () => {
    const res = applyDecision(draft, {
      source: 1, shapeIndex: 1, decision: "confirmed", token: "utan-klamrar",
    });
    expect(res.ok).toBe(false);
  });

  it("avvisar token-kollision med annan slot", () => {
    const res = applyDecision(draft, {
      source: 2, shapeIndex: 0, decision: "confirmed", token: "{Metod}",
    });
    expect(res.ok).toBe(false);
  });

  it("muterar inte input-utkastet", () => {
    const before = structuredClone(draft);
    applyDecision(draft, { source: 1, shapeIndex: 1, decision: "skipped" });
    expect(draft).toEqual(before);
  });
});

describe("buildInjections + buildFinalProfile", () => {
  it("endast bekräftade slots blir injektioner", () => {
    const draft = buildDraft(proposal, slides, SIZE); // slot 1 confirmed, slot 2 pending
    expect(buildInjections(draft)).toEqual([
      { source: 1, shapeIndex: 1, token: "{Metod}" },
    ]);
  });

  it("slutprofilen: bekräftade slots generic-prose, resten static — validerar mot schemat", () => {
    const draft = buildDraft(proposal, slides, SIZE);
    const profile = buildFinalProfile(draft, { templateId: "t-1", name: "kundmall", version: 1 });
    expect(profile.slides).toHaveLength(2);
    expect(profile.slides[0].capability).toBe("generic-prose");
    expect(profile.slides[0].slots[0]).toMatchObject({
      placeholder: "{Metod}", capability: "generic-prose", format: "prose", status: "generic",
    });
    expect(profile.slides[1].capability).toBe("static");
    expect(profile.slides[1].slots).toEqual([]);
  });

  it("kastar vid noll bekräftade slots", () => {
    const draft = buildDraft(proposal, slides, SIZE);
    const allSkipped = {
      ...draft,
      slots: draft.slots.map((s) => ({ ...s, decision: "skipped" as const })),
    };
    expect(() =>
      buildFinalProfile(allSkipped, { templateId: "t-1", name: "kundmall", version: 1 }),
    ).toThrow("minst en textruta måste bekräftas");
  });
});
```

- [ ] **Step 2: Kör — ska faila** (`Cannot find module '../draft-logic'`)

- [ ] **Step 3: Implementera**

```ts
// src/lib/pptx-template/onboarding/draft-logic.ts
import type { SlideShapes } from "../introspect/read-pptx";
import type { TokenInjection } from "../instrument/instrument-template";
import type { ProposedSlot } from "./propose-injection-plan";
import {
  parseTemplateProfile,
  type TemplateProfile,
} from "../template-profile";
import {
  parseOnboardingDraft,
  TOKEN_RE,
  type OnboardingDraft,
  type DraftSlot,
} from "./draft";

/** Wireframe-etiketterna behöver bara igenkänning, inte hela texten. */
const WIREFRAME_TEXT_MAX = 120;

/**
 * Förslag → utkast: hög konfidens förbekräftas (användaren kan fortfarande
 * ändra), låg kräver ställningstagande. Wireframen byggs för ALLA slides
 * (även kandidat-lösa — de visas som statiska i navigeringen).
 */
export function buildDraft(
  slots: ProposedSlot[],
  slides: SlideShapes[],
  slideSize: { cx: number; cy: number },
): OnboardingDraft {
  const candidateKeys = new Set(slots.map((s) => `${s.source}:${s.shapeIndex}`));
  const draftSlots: DraftSlot[] = slots.map((s) => ({
    source: s.source,
    shapeIndex: s.shapeIndex,
    shapeText: s.shapeText,
    token: s.token,
    capability: s.capability,
    intent: s.intent.slice(0, 500),
    confidence: s.confidence,
    decision: s.confidence === "high" ? "confirmed" : "pending",
  }));
  const wireframe = slides.map((slide) => ({
    source: slide.source,
    shapes: slide.shapes.map((shape, shapeIndex) => ({
      shapeIndex,
      geometry: shape.geometry,
      text: shape.paragraphs.join(" ").slice(0, WIREFRAME_TEXT_MAX),
      candidate: candidateKeys.has(`${slide.source}:${shapeIndex}`),
    })),
  }));
  // Validera vår egen hopsättning — fail loud, spegling av proposeInjectionPlan.
  return parseOnboardingDraft({
    draftVersion: 1,
    slideSize,
    slots: draftSlots,
    wireframe,
  });
}

export interface SlotDecisionInput {
  source: number;
  shapeIndex: number;
  decision: "confirmed" | "skipped" | "pending";
  token?: string;
  intent?: string;
}

type ApplyResult =
  | { ok: true; draft: OnboardingDraft }
  | { ok: false; error: string };

/**
 * Ett slot-beslut in i utkastet — ren funktion (muterar inte input) så den kan
 * enhetstestas och återanvändas optimistiskt i UI:t. Validerar adress,
 * tokenformat (instrumentTemplates kontrakt) och token-unikhet över planen
 * (kollision → två shapes fylls med samma innehåll, tyst och svårfelsökt).
 */
export function applyDecision(
  draft: OnboardingDraft,
  input: SlotDecisionInput,
): ApplyResult {
  const idx = draft.slots.findIndex(
    (s) => s.source === input.source && s.shapeIndex === input.shapeIndex,
  );
  if (idx === -1) {
    return { ok: false, error: `okänd slot ${input.source}:${input.shapeIndex}` };
  }
  const token = input.token ?? draft.slots[idx].token;
  if (!TOKEN_RE.test(token)) {
    return { ok: false, error: `ogiltigt tokenformat: ${token}` };
  }
  const collision = draft.slots.some(
    (s, i) => i !== idx && s.token === token,
  );
  if (collision) {
    return { ok: false, error: `token ${token} används redan av en annan textruta` };
  }
  const slots = draft.slots.map((s, i) =>
    i === idx
      ? {
          ...s,
          decision: input.decision,
          token,
          intent: (input.intent ?? s.intent).slice(0, 500),
        }
      : s,
  );
  return { ok: true, draft: { ...draft, slots } };
}

/** Endast bekräftade slots instrumenteras — skippade lämnas orörda i kopian. */
export function buildInjections(draft: OnboardingDraft): TokenInjection[] {
  return draft.slots
    .filter((s) => s.decision === "confirmed")
    .map((s) => ({ source: s.source, shapeIndex: s.shapeIndex, token: s.token }));
}

/**
 * Slutprofilen: en SlideProfile per wireframe-slide (ALLA slides — en utelämnad
 * slide försvinner ur renderade anbud, se proposeInjectionPlan). Bekräftade
 * slots → generic-prose (v1-beslutet: specialiserade applikatorer kräver våra
 * kanoniska tokens); slides utan bekräftade slots → static passthrough.
 */
export function buildFinalProfile(
  draft: OnboardingDraft,
  meta: { templateId: string; name: string; version: number },
): TemplateProfile {
  const confirmed = draft.slots.filter((s) => s.decision === "confirmed");
  if (confirmed.length === 0) {
    throw new Error("minst en textruta måste bekräftas");
  }
  const slides = draft.wireframe.map((slide) => {
    const slideSlots = confirmed
      .filter((s) => s.source === slide.source)
      .map((s) => ({
        placeholder: s.token,
        capability: "generic-prose" as const,
        format: "prose" as const,
        intent: s.intent,
        status: "generic" as const,
      }));
    return slideSlots.length === 0
      ? { source: slide.source, capability: "static" as const, slots: [] }
      : { source: slide.source, capability: "generic-prose" as const, slots: slideSlots };
  });
  return parseTemplateProfile({
    profileVersion: 1,
    templateId: meta.templateId,
    name: meta.name,
    version: meta.version,
    slides,
  });
}
```

- [ ] **Step 4: Kör — ska passa** (`npx vitest run src/lib/pptx-template/onboarding`)

- [ ] **Step 5: Commit** — `feat(onboarding): draft-logic — buildDraft/applyDecision/buildInjections/buildFinalProfile`

---

### Task 4: Foreign-detektering i upload-routen

**Files:**
- Modify: `src/app/api/templates/route.ts` (POST)
- Create: `src/lib/pptx-template/onboarding/detect-foreign.ts`
- Test: `src/lib/pptx-template/onboarding/__tests__/detect-foreign.test.ts`

**Interfaces:**
- Consumes: `readPptxSlides`, `candidateSlots` (exporterad, pure) från `./propose-injection-plan`.
- Produces: `isForeignPptx(slides: SlideShapes[]): boolean`. Upload-svaret utökas: `{ id, name, version, needsOnboarding: true, precount: { slides, candidates } }` för foreign-vägen — Task 8/10 (UI) konsumerar det. `onboarding_draft` sätts till `{ precount }`.

- [ ] **Step 1: Failande test för detektorn**

```ts
// src/lib/pptx-template/onboarding/__tests__/detect-foreign.test.ts
import { describe, it, expect } from "vitest";
import type { SlideShapes } from "../../introspect/read-pptx";
import { isForeignPptx } from "../detect-foreign";

function slide(tokens: string[]): SlideShapes {
  return { source: 1, shapes: [], tokens, images: { placed: 0, placeholders: 0 } } as unknown as SlideShapes;
}

describe("isForeignPptx", () => {
  it("tokenlös mall är foreign", () => {
    expect(isForeignPptx([slide([]), slide([])])).toBe(true);
  });
  it("en enda token → INTE foreign (delvis instrumenterad går dagens 422-väg)", () => {
    expect(isForeignPptx([slide([]), slide(["{Namn}"])])).toBe(false);
  });
});
```

- [ ] **Step 2: Kör — faila. Implementera:**

```ts
// src/lib/pptx-template/onboarding/detect-foreign.ts
import type { SlideShapes } from "../introspect/read-pptx";

/**
 * En kundmall utan ETT ENDA {token} är "foreign" → onboarding-vägen. Mallar
 * med några tokens men fel konvention går kvar i dagens introspektions-422
 * (delvis instrumenterade mallar är re-onboarding-merge, backloggad).
 */
export function isForeignPptx(slides: SlideShapes[]): boolean {
  return slides.every((s) => s.tokens.length === 0);
}
```

- [ ] **Step 3: Kör — passa. Modifiera POST i `src/app/api/templates/route.ts`:**

Ersätt introspektions-blocket (rad ~46–56) och låt storage/insert-delen delas av båda vägarna:

```ts
import { readPptxSlides } from "@/lib/pptx-template/introspect/read-pptx";
import { isForeignPptx } from "@/lib/pptx-template/onboarding/detect-foreign";
import { candidateSlots } from "@/lib/pptx-template/onboarding/propose-injection-plan";

// ... befintlig auth/fil-validering/namn-derivering oförändrad ...

  // Foreign-detektering FÖRE introspektion: en tokenlös kundmall kan aldrig
  // matcha slide-signaturerna — den ska in i onboarding, inte få 422.
  let slides;
  try {
    slides = await readPptxSlides(buffer);
  } catch (err) {
    return NextResponse.json(
      { error: `filen kunde inte läsas som pptx: ${err instanceof Error ? err.message : String(err)}` },
      { status: 422 },
    );
  }
  const foreign = isForeignPptx(slides);

  let manifest = null;
  let warnings: string[] = [];
  if (!foreign) {
    try {
      ({ manifest, warnings } = await introspectTemplate(buffer, name));
    } catch (err) {
      return NextResponse.json(
        { error: `mallen kunde inte introspekteras: ${err instanceof Error ? err.message : String(err)}` },
        { status: 422 },
      );
    }
  }

  // ... befintlig versionering + storage-upload OFÖRÄNDRAD ...

  const { data: row, error: insErr } = await service
    .from("templates")
    .insert({
      name,
      version,
      storage_path: storagePath,
      manifest, // null för foreign — nullable sedan migration 012
      onboarding_status: foreign ? "needs_onboarding" : "none",
      // precount: startsidan visar omfång + kostnadsindikation utan att
      // behöva ladda ner och parsa pptx:en igen.
      onboarding_draft: foreign
        ? { precount: { slides: slides.length, candidates: candidateSlots(slides).length } }
        : null,
    })
    .select("id")
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  if (foreign) {
    clearTemplateCache();
    return NextResponse.json({
      id: row.id, name, version, needsOnboarding: true,
      precount: { slides: slides.length, candidates: candidateSlots(slides).length },
    });
  }

  // ... befintlig manifestToProfile/saveTemplateProfile + svar OFÖRÄNDRAT ...
```

Surgical: rör inte den token-bärande vägens beteende. `manifestToProfile`-blocket körs ENDAST i icke-foreign-grenen (flytta in det i `if (!foreign)` eller returnera före).

- [ ] **Step 4: Kör hela sviten + typecheck**

Run: `npx vitest run src/lib && npx tsc --noEmit`
Expected: PASS, inga typfel

- [ ] **Step 5: Commit** — `feat(onboarding): upload auto-detekterar tokenlösa kundmallar → needs_onboarding`

---

### Task 5: GET + PATCH `/api/templates/[id]/onboarding`

**Files:**
- Create: `src/app/api/templates/[id]/onboarding/route.ts`
- Modify: `src/lib/api-schemas.ts` (lägg till `OnboardingDecisionSchema`)
- Test: `src/lib/__tests__/api-schemas.test.ts` om den finns, annars `src/lib/pptx-template/onboarding/__tests__/decision-schema.test.ts`

**Interfaces:**
- Consumes: `requireUser`, `parseUuidParam`, `parseBody` från `@/lib/api-helpers`; `parseOnboardingDraft`; `applyDecision` (Task 3).
- Produces:
  - `GET` → `{ status, draft: OnboardingDraft | null, error?: string, precount?: { slides, candidates } }` (error/precount ur icke-utkast-payloads i kolumnen).
  - `PATCH` body = `SlotDecisionInput` → `{ draft }` (uppdaterat) eller 422 `{ error }`.
  - `OnboardingDecisionSchema` (Zod) i api-schemas.

- [ ] **Step 1: Failande schema-test**

```ts
// läggs där repo:t redan testar api-schemas; annars:
// src/lib/pptx-template/onboarding/__tests__/decision-schema.test.ts
import { describe, it, expect } from "vitest";
import { OnboardingDecisionSchema } from "@/lib/api-schemas";

describe("OnboardingDecisionSchema", () => {
  it("accepterar ett beslut med redigering", () => {
    expect(
      OnboardingDecisionSchema.safeParse({
        source: 1, shapeIndex: 0, decision: "confirmed",
        token: "{Metod}", intent: "Metodbeskrivning",
      }).success,
    ).toBe(true);
  });
  it("avvisar okänt decision-värde och negativ shapeIndex", () => {
    expect(OnboardingDecisionSchema.safeParse({ source: 1, shapeIndex: 0, decision: "maybe" }).success).toBe(false);
    expect(OnboardingDecisionSchema.safeParse({ source: 1, shapeIndex: -1, decision: "skipped" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Kör — faila. Lägg till i `src/lib/api-schemas.ts` (matcha filens stil):**

```ts
/** Slot-beslut i onboarding-wizarden (PATCH /api/templates/[id]/onboarding). */
export const OnboardingDecisionSchema = z.object({
  source: z.number().int().positive(),
  shapeIndex: z.number().int().nonnegative(),
  decision: z.enum(["confirmed", "skipped", "pending"]),
  token: z.string().max(80).optional(),
  intent: z.string().max(500).optional(),
});
```

- [ ] **Step 3: Kör — passa. Skriv routen:**

```ts
// src/app/api/templates/[id]/onboarding/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { requireUser, parseUuidParam, parseBody } from "@/lib/api-helpers";
import { OnboardingDecisionSchema } from "@/lib/api-schemas";
import { parseOnboardingDraft } from "@/lib/pptx-template/onboarding/draft";
import { applyDecision } from "@/lib/pptx-template/onboarding/draft-logic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Läser mall-raden och normaliserar onboarding_draft-kolumnens tre payloads:
 *  utkast (schema-validerat), { error } (klassificeringsfel), { precount }
 *  (satt av upload, före klassificering). */
async function loadOnboardingRow(id: string) {
  const supabase = createServiceClient();
  const { data: row, error } = await supabase
    .from("templates")
    .select("id, name, version, storage_path, onboarding_status, onboarding_draft")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return row;
}

function draftPayload(raw: unknown): {
  draft: ReturnType<typeof parseOnboardingDraft> | null;
  error?: string;
  precount?: { slides: number; candidates: number };
} {
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.error === "string") return { draft: null, error: obj.error };
    if (obj.precount) return { draft: null, precount: obj.precount as { slides: number; candidates: number } };
    return { draft: parseOnboardingDraft(raw) };
  }
  return { draft: null };
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const authed = await createClient();
  const auth = await requireUser(authed);
  if (!auth.ok) return auth.response;

  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "template id");
  if (!idResult.ok) return idResult.response;

  const row = await loadOnboardingRow(idResult.data);
  if (!row) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  return NextResponse.json({
    status: row.onboarding_status,
    name: row.name,
    version: row.version,
    ...draftPayload(row.onboarding_draft),
  });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authed = await createClient();
  const auth = await requireUser(authed);
  if (!auth.ok) return auth.response;

  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "template id");
  if (!idResult.ok) return idResult.response;

  const parsed = await parseBody(request, OnboardingDecisionSchema);
  if (!parsed.ok) return parsed.response;

  const row = await loadOnboardingRow(idResult.data);
  if (!row) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  if (row.onboarding_status !== "draft") {
    return NextResponse.json(
      { error: `mallen är i status '${row.onboarding_status}' — beslut kan bara tas i 'draft'` },
      { status: 409 },
    );
  }

  const { draft } = draftPayload(row.onboarding_draft);
  if (!draft) return NextResponse.json({ error: "utkast saknas" }, { status: 409 });

  const result = applyDecision(draft, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("templates")
    .update({ onboarding_draft: result.draft })
    .eq("id", idResult.data);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ draft: result.draft });
}
```

OBS: kontrollera `parseBody`/`parseUuidParam`-signaturerna i `api-helpers.ts` och matcha exakt (mönstret ovan är taget från activate-routen + bids-routen).

- [ ] **Step 4: Kör svit + typecheck — passa**

- [ ] **Step 5: Commit** — `feat(onboarding): GET/PATCH onboarding-utkast med validerade slot-beslut`

---

### Task 6: POST `/api/templates/[id]/onboarding/propose` (async klassificering)

**Files:**
- Create: `src/app/api/templates/[id]/onboarding/propose/route.ts`

**Interfaces:**
- Consumes: `proposeInjectionPlan`, `buildDraft` (Task 3), `readSlideSize` (Task 2), `readPptxSlides`, `TEMPLATE_BUCKET` från `@/lib/pptx-template/template-store`, `after` från `next/server`.
- Produces: `POST` (body `{ force?: boolean }`, valfri) → 202 `{ status: "classifying" }`. Jobbet sätter status `draft` + utkast, eller `needs_onboarding` + `{ error }` vid fel. Task 10 pollar via Task 5-GET.

- [ ] **Step 1: Skriv routen** (tunn orkestrering av redan testade delar — ingen ny enhetslogik; kedjetestet i Task 11 täcker flödet)

```ts
// src/app/api/templates/[id]/onboarding/propose/route.ts
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { requireUser, parseUuidParam } from "@/lib/api-helpers";
import { getUserId } from "@/lib/org";
import { TEMPLATE_BUCKET } from "@/lib/pptx-template/template-store";
import { readPptxSlides } from "@/lib/pptx-template/introspect/read-pptx";
import { proposeInjectionPlan } from "@/lib/pptx-template/onboarding/propose-injection-plan";
import { readSlideSize } from "@/lib/pptx-template/onboarding/slide-size";
import { buildDraft } from "@/lib/pptx-template/onboarding/draft-logic";

// 50–100+ klassificeringsanrop (chunkade om 6) överlever inte default-timeouten.
// Samma mönster och tak som bid-genereringen (Vercel Hobby-taket).
export const maxDuration = 300;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const authed = await createClient();
  const auth = await requireUser(authed);
  if (!auth.ok) return auth.response;
  const userId = await getUserId(authed);

  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "template id");
  if (!idResult.ok) return idResult.response;
  const id = idResult.data;

  const force = ((await request.json().catch(() => ({}))) as { force?: boolean }).force === true;

  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from("templates")
    .select("id, name, version, storage_path, onboarding_status")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  // needs_onboarding är normalstarten; draft/classifying kräver force (omkörning
  // slänger beslut resp. kan dubbelköra ett hängt jobb — explicit avsikt krävs).
  const allowed =
    row.onboarding_status === "needs_onboarding" ||
    (force && ["draft", "classifying"].includes(row.onboarding_status));
  if (!allowed) {
    return NextResponse.json(
      { error: `kan inte klassificera i status '${row.onboarding_status}'${force ? "" : " utan force"}` },
      { status: 409 },
    );
  }
  if (!row.storage_path) {
    return NextResponse.json({ error: "mallen saknar storage-fil" }, { status: 409 });
  }

  await supabase
    .from("templates")
    .update({ onboarding_status: "classifying" })
    .eq("id", id);

  after(async () => {
    try {
      const { data: file, error: dlErr } = await supabase.storage
        .from(TEMPLATE_BUCKET)
        .download(row.storage_path);
      if (dlErr || !file) throw new Error(dlErr?.message ?? "kunde inte ladda ner mallfilen");
      const buffer = Buffer.from(await file.arrayBuffer());

      const [slides, slideSize, proposal] = await Promise.all([
        readPptxSlides(buffer),
        readSlideSize(buffer),
        proposeInjectionPlan(buffer, {
          templateId: id,
          name: row.name,
          version: row.version,
          userId,
        }),
      ]);
      const draft = buildDraft(proposal.slots, slides, slideSize);

      await supabase
        .from("templates")
        .update({ onboarding_draft: draft, onboarding_status: "draft" })
        .eq("id", id);
    } catch (err) {
      // Felet ytas på startsidan; needs_onboarding gör retry-knappen giltig igen.
      await supabase
        .from("templates")
        .update({
          onboarding_status: "needs_onboarding",
          onboarding_draft: { error: err instanceof Error ? err.message : String(err) },
        })
        .eq("id", id);
    }
  });

  return NextResponse.json({ status: "classifying" }, { status: 202 });
}
```

- [ ] **Step 2: Typecheck + svit** — `npx tsc --noEmit && npx vitest run src/lib`
Expected: PASS

- [ ] **Step 3: Commit** — `feat(onboarding): async propose-endpoint (after() + polling, bid-gen-mönstret)`

---

### Task 7: POST `/api/templates/[id]/onboarding/complete` + aktiverings-grind

**Files:**
- Create: `src/app/api/templates/[id]/onboarding/complete/route.ts`
- Modify: `src/app/api/templates/[id]/activate/route.ts`

**Interfaces:**
- Consumes: `buildInjections`, `buildFinalProfile` (Task 3), `instrumentTemplate`, `saveTemplateProfile`, `TEMPLATE_BUCKET`, `clearTemplateCache`.
- Produces: `POST /complete` → `{ onboarded: true }`; 422 vid noll bekräftade / ogiltiga tokens; status-flippen är SISTA skrivningen (retry-säkert). Activate vägrar 409 för status utanför `none`/`onboarded`.

- [ ] **Step 1: Skriv complete-routen**

```ts
// src/app/api/templates/[id]/onboarding/complete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { requireUser, parseUuidParam } from "@/lib/api-helpers";
import { TEMPLATE_BUCKET, clearTemplateCache } from "@/lib/pptx-template/template-store";
import { instrumentTemplate } from "@/lib/pptx-template/instrument/instrument-template";
import { saveTemplateProfile } from "@/lib/pptx-template/profile-store";
import { parseOnboardingDraft } from "@/lib/pptx-template/onboarding/draft";
import { buildInjections, buildFinalProfile } from "@/lib/pptx-template/onboarding/draft-logic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const authed = await createClient();
  const auth = await requireUser(authed);
  if (!auth.ok) return auth.response;

  const { id: rawId } = await params;
  const idResult = parseUuidParam(rawId, "template id");
  if (!idResult.ok) return idResult.response;
  const id = idResult.data;

  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from("templates")
    .select("id, name, version, storage_path, onboarding_status, onboarding_draft")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  if (row.onboarding_status !== "draft") {
    return NextResponse.json(
      { error: `kan bara slutföra i status 'draft' (är '${row.onboarding_status}')` },
      { status: 409 },
    );
  }

  let draft;
  try {
    draft = parseOnboardingDraft(row.onboarding_draft);
  } catch {
    return NextResponse.json({ error: "utkastet är korrupt — kör om klassificeringen" }, { status: 409 });
  }

  // Validera FÖRE sidoeffekter — 422:orna ska inte lämna halvt tillstånd.
  let profile, injections;
  try {
    profile = buildFinalProfile(draft, { templateId: id, name: row.name, version: row.version });
    injections = buildInjections(draft);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 422 },
    );
  }

  const { data: file, error: dlErr } = await supabase.storage
    .from(TEMPLATE_BUCKET)
    .download(row.storage_path);
  if (dlErr || !file) {
    return NextResponse.json({ error: dlErr?.message ?? "kunde inte ladda ner mallfilen" }, { status: 500 });
  }
  const original = Buffer.from(await file.arrayBuffer());

  let instrumented: Buffer;
  try {
    instrumented = await instrumentTemplate(original, injections);
  } catch (err) {
    return NextResponse.json(
      { error: `instrumentering misslyckades: ${err instanceof Error ? err.message : String(err)}` },
      { status: 422 },
    );
  }

  // Originalet BEHÅLLS på sin path (re-onboarding-merge är backloggad) — den
  // instrumenterade kopian blir mallens körbara fil. upsert: retry efter
  // partiellt fel ska kunna skriva om samma objekt.
  const instrumentedPath = `${row.name}/v${row.version}-instrumented.pptx`;
  const { error: upErr } = await supabase.storage
    .from(TEMPLATE_BUCKET)
    .upload(instrumentedPath, instrumented, {
      contentType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      upsert: true,
    });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  await saveTemplateProfile(profile); // kastar → 500 via Next; status förblir 'draft'

  // Status-flippen SIST och atomiskt med storage_path-bytet — ett fel innan
  // hit lämnar mallen i 'draft' och complete kan köras om.
  const { error: updErr } = await supabase
    .from("templates")
    .update({ storage_path: instrumentedPath, onboarding_status: "onboarded" })
    .eq("id", id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  clearTemplateCache();
  return NextResponse.json({ onboarded: true });
}
```

- [ ] **Step 2: Aktiverings-grinden** — i `activate/route.ts`, utöka selecten och lägg grinden direkt efter 404-kollen:

```ts
  const { data: tpl } = await supabase
    .from("templates")
    .select("id, onboarding_status")
    .eq("id", id)
    .maybeSingle();
  if (!tpl) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  // En halvfärdig kundmall får inte bli aktiv — den kan inte rendera något.
  if (!["none", "onboarded"].includes(tpl.onboarding_status)) {
    return NextResponse.json(
      { error: "mallen är inte färdig-onboardad — slutför onboardingen först" },
      { status: 409 },
    );
  }
```

- [ ] **Step 3: Typecheck + svit — passa**

- [ ] **Step 4: Commit** — `feat(onboarding): complete-endpoint (instrumentering + slutprofil) + aktiverings-grind`

---

### Task 8: TemplateSection + Inställningar-sidan — foreign-mallar i listan

**Files:**
- Modify: `src/app/installningar/page.tsx` (TemplateRow + select)
- Modify: `src/components/settings/TemplateSection.tsx`
- Test: `src/components/settings/__tests__/TemplateSection.test.tsx` (utöka)

**Interfaces:**
- Consumes: upload-svarets `needsOnboarding` (Task 4).
- Produces: `TemplateRow` får `onboarding_status: string`; rader med status utanför `none`/`onboarded` visar "Onboarda →"-länk i stället för Aktivera-knapp; lyckad foreign-upload navigerar till wizarden.

- [ ] **Step 1: Failande komponenttest** (följ befintliga testers rendering/mock-mönster i filen — läs den först):

```tsx
it("visar Onboarda-länk i stället för Aktivera för mall som behöver onboarding", () => {
  render(
    <TemplateSection
      templates={[{
        id: "t-1", name: "kundmall", version: 1, manifest: null,
        onboarding_status: "needs_onboarding", created_at: "2026-07-05T00:00:00Z",
      } as unknown as TemplateRow]}
      activeTemplateId={null}
    />,
  );
  expect(screen.getByRole("link", { name: /onboarda/i })).toHaveAttribute(
    "href", "/installningar/mallar/t-1/onboarding",
  );
  expect(screen.queryByRole("button", { name: /^aktivera$/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Kör — faila. Implementera:**

I `page.tsx`: lägg `onboarding_status` i `TemplateRow`-interfacet (`onboarding_status: string`), gör `manifest` `TemplateManifest | null`, och lägg kolumnen i selecten: `"id, name, version, manifest, onboarding_status, created_at"`.

I `TemplateSection.tsx`:
1. `UploadResponse`: `manifest` → valfri (`manifest?: TemplateManifest`), nytt fält `needsOnboarding?: boolean`.
2. I `handleUpload` efter lyckat svar:

```ts
      const data: UploadResponse = await response.json();
      if (data.needsOnboarding) {
        // Kundmall utan tokens — raka vägen in i onboarding-wizarden.
        router.push(`/installningar/mallar/${data.id}/onboarding`);
        return;
      }
      setPreview(data);
```

3. I tabellraden, ersätt Aktivera-knappen för foreign-rader (`import Link from "next/link"`):

```tsx
{t.id === activeTemplateId ? (
  <span className="...">Aktiv</span>
) : !["none", "onboarded"].includes(t.onboarding_status) ? (
  <Link
    href={`/installningar/mallar/${t.id}/onboarding`}
    className="text-xs font-medium px-3 py-1 rounded border border-rule hover:border-accent"
  >
    Onboarda →
  </Link>
) : (
  /* befintlig Aktivera-knapp oförändrad */
)}
```

4. `TemplatePreview` läser `manifest` — den renderas bara för icke-foreign-svar; lägg en tidig `if (!preview.manifest) return null;`-vakt i `TemplatePreview` (eller villkora `{preview && preview.manifest && <TemplatePreview .../>}`).

- [ ] **Step 3: Kör komponenttester + typecheck — passa**

Run: `npx vitest run src/components && npx tsc --noEmit`

- [ ] **Step 4: Commit** — `feat(onboarding): mall-listan visar Onboarda-länk + upload navigerar till wizarden`

---

### Task 9: SlideWireframe-komponenten

**Files:**
- Create: `src/components/onboarding/SlideWireframe.tsx`
- Test: `src/components/onboarding/__tests__/SlideWireframe.test.tsx`

**Interfaces:**
- Consumes: `WireframeSlide` (Task 1).
- Produces: `<SlideWireframe slide slideSize selectedShapeIndex decisions onSelect />` där `decisions: ReadonlyMap<number, "confirmed"|"skipped"|"pending">` (per shapeIndex på aktuell slide). Task 10 använder den.

- [ ] **Step 1: Failande test**

```tsx
// src/components/onboarding/__tests__/SlideWireframe.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SlideWireframe } from "../SlideWireframe";

const slide = {
  source: 3,
  shapes: [
    { shapeIndex: 0, geometry: { x: 0, y: 0, cx: 4000000, cy: 800000 }, text: "Rubrik", candidate: false },
    { shapeIndex: 1, geometry: { x: 0, y: 1000000, cx: 6000000, cy: 3000000 }, text: "Beskriv er metod", candidate: true },
    { shapeIndex: 2, geometry: null, text: "Svävande ruta", candidate: true },
  ],
};
const size = { cx: 12192000, cy: 6858000 };

describe("SlideWireframe", () => {
  it("ritar placerbara shapes och listar geometri-lösa kandidater separat", () => {
    render(
      <SlideWireframe slide={slide} slideSize={size} selectedShapeIndex={null}
        decisions={new Map([[1, "pending"]])} onSelect={() => {}} />,
    );
    expect(screen.getByTestId("shape-3-0")).toBeInTheDocument();
    expect(screen.getByTestId("shape-3-1")).toBeInTheDocument();
    expect(screen.getByText(/svävande ruta/i)).toBeInTheDocument(); // listan under
  });

  it("klick på kandidat anropar onSelect med shapeIndex", () => {
    const onSelect = vi.fn();
    render(
      <SlideWireframe slide={slide} slideSize={size} selectedShapeIndex={null}
        decisions={new Map([[1, "pending"]])} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByTestId("shape-3-1"));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("statiska shapes är inte klickbara", () => {
    const onSelect = vi.fn();
    render(
      <SlideWireframe slide={slide} slideSize={size} selectedShapeIndex={null}
        decisions={new Map()} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByTestId("shape-3-0"));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Kör — faila. Implementera:**

```tsx
// src/components/onboarding/SlideWireframe.tsx
"use client";

import type { WireframeSlide } from "@/lib/pptx-template/onboarding/draft";

export type SlotDecision = "confirmed" | "skipped" | "pending";

// SVG:ns viewBox är i EMU — webbläsaren skalar, ingen enhetskonvertering.
// 1 pt = 12700 EMU (för streck/typografi i EMU-rymden).
const EMU_PER_PT = 12700;

const DECISION_FILL: Record<SlotDecision, string> = {
  confirmed: "rgba(122, 46, 46, 0.12)", // accent-soft-ton
  skipped: "transparent",
  pending: "rgba(212, 169, 75, 0.18)", // varningston — kräver ställningstagande
};

interface SlideWireframeProps {
  slide: WireframeSlide;
  slideSize: { cx: number; cy: number };
  selectedShapeIndex: number | null;
  decisions: ReadonlyMap<number, SlotDecision>;
  onSelect: (shapeIndex: number) => void;
}

export function SlideWireframe({
  slide,
  slideSize,
  selectedShapeIndex,
  decisions,
  onSelect,
}: SlideWireframeProps) {
  const placeable = slide.shapes.filter((s) => s.geometry !== null);
  const floating = slide.shapes.filter((s) => s.geometry === null && s.candidate);

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${slideSize.cx} ${slideSize.cy}`}
        className="w-full border border-rule rounded-lg bg-white"
        role="img"
        aria-label={`Slide ${slide.source}`}
      >
        {placeable.map((shape) => {
          const g = shape.geometry!;
          const decision = shape.candidate ? (decisions.get(shape.shapeIndex) ?? "pending") : null;
          const selected = shape.shapeIndex === selectedShapeIndex;
          return (
            <g
              key={shape.shapeIndex}
              data-testid={`shape-${slide.source}-${shape.shapeIndex}`}
              onClick={shape.candidate ? () => onSelect(shape.shapeIndex) : undefined}
              className={shape.candidate ? "cursor-pointer" : undefined}
            >
              <rect
                x={g.x} y={g.y} width={g.cx} height={g.cy}
                fill={decision ? DECISION_FILL[decision] : "transparent"}
                stroke={selected ? "#7a2e2e" : "#c9c2b4"}
                strokeWidth={(selected ? 2.5 : 0.75) * EMU_PER_PT}
                strokeDasharray={decision === "skipped" ? `${2 * EMU_PER_PT} ${2 * EMU_PER_PT}` : undefined}
              />
              <text
                x={g.x + 4 * EMU_PER_PT}
                y={g.y + 14 * EMU_PER_PT}
                fontSize={10 * EMU_PER_PT}
                fill="#4a463e"
              >
                {shape.text.slice(0, 48)}
              </text>
            </g>
          );
        })}
      </svg>
      {floating.length > 0 && (
        <div className="text-sm text-ink-soft">
          <p className="font-medium text-ink-mute text-xs uppercase tracking-wide">
            Rutor utan position (ärvd geometri)
          </p>
          <ul className="mt-1 space-y-1">
            {floating.map((shape) => (
              <li key={shape.shapeIndex}>
                <button
                  type="button"
                  onClick={() => onSelect(shape.shapeIndex)}
                  className={`underline-offset-2 hover:underline ${
                    shape.shapeIndex === selectedShapeIndex ? "text-accent font-medium" : ""
                  }`}
                >
                  {shape.text || "(tom textruta)"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

Färgerna: kolla `globals.css`/Tailwind-tokens efter app-restylen och använd befintliga CSS-variabler om de finns exponerade (`var(--color-accent)` etc.) i stället för hex — matcha hur andra komponenter gör.

- [ ] **Step 3: Kör — passa. Commit** — `feat(onboarding): SlideWireframe — EMU-viewBox-wireframe med beslutstillstånd`

---

### Task 10: Wizard-sidan + OnboardingWizard-komponenten

**Files:**
- Create: `src/app/installningar/mallar/[id]/onboarding/page.tsx`
- Create: `src/components/onboarding/OnboardingWizard.tsx`
- Create: `src/components/onboarding/SlotPanel.tsx`
- Test: `src/components/onboarding/__tests__/SlotPanel.test.tsx`

**Interfaces:**
- Consumes: GET/PATCH (Task 5), propose (Task 6), complete (Task 7), `SlideWireframe` (Task 9), `OnboardingDraft`/`DraftSlot`-typerna.
- Produces: hela wizard-flödet. `SlotPanel` props: `{ slot: DraftSlot; onDecide(input: { decision; token?; intent? }): void; saving: boolean }`.

- [ ] **Step 1: Failande SlotPanel-test**

```tsx
// src/components/onboarding/__tests__/SlotPanel.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SlotPanel } from "../SlotPanel";

const slot = {
  source: 1, shapeIndex: 1, shapeText: "Beskriv er metod",
  token: "{Metod}", capability: "understanding" as const,
  intent: "Leverantörens metodbeskrivning", confidence: "high" as const,
  decision: "pending" as const,
};

describe("SlotPanel", () => {
  it("Bekräfta skickar redigerad token + intent", () => {
    const onDecide = vi.fn();
    render(<SlotPanel slot={slot} onDecide={onDecide} saving={false} />);
    fireEvent.change(screen.getByLabelText(/tokennamn/i), { target: { value: "Vår metod" } });
    fireEvent.change(screen.getByLabelText(/syfte/i), { target: { value: "Metod och arbetssätt" } });
    fireEvent.click(screen.getByRole("button", { name: /bekräfta/i }));
    expect(onDecide).toHaveBeenCalledWith({
      decision: "confirmed", token: "{Vår metod}", intent: "Metod och arbetssätt",
    });
  });

  it("Skippa skickar skipped", () => {
    const onDecide = vi.fn();
    render(<SlotPanel slot={slot} onDecide={onDecide} saving={false} />);
    fireEvent.click(screen.getByRole("button", { name: /skippa/i }));
    expect(onDecide).toHaveBeenCalledWith({ decision: "skipped" });
  });

  it("visar förmåge-gissningen som info, inte som val", () => {
    render(<SlotPanel slot={slot} onDecide={vi.fn()} saving={false} />);
    expect(screen.getByText(/understanding/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Kör — faila. Implementera SlotPanel:**

```tsx
// src/components/onboarding/SlotPanel.tsx
"use client";

import { useEffect, useState } from "react";
import type { DraftSlot } from "@/lib/pptx-template/onboarding/draft";

interface SlotPanelProps {
  slot: DraftSlot;
  onDecide: (input: { decision: "confirmed" | "skipped"; token?: string; intent?: string }) => void;
  saving: boolean;
}

/** Strippar klamrar för redigering — användaren skriver namnet, vi bär {}-formatet. */
function tokenName(token: string): string {
  return token.replace(/^\{|\}$/g, "");
}

export function SlotPanel({ slot, onDecide, saving }: SlotPanelProps) {
  const [name, setName] = useState(tokenName(slot.token));
  const [intent, setIntent] = useState(slot.intent);

  // Byte av vald slot → panelen speglar den nya slotens värden.
  useEffect(() => {
    setName(tokenName(slot.token));
    setIntent(slot.intent);
  }, [slot.source, slot.shapeIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4 border border-rule rounded-lg p-4 bg-paper-2">
      <div>
        <p className="text-xs uppercase tracking-wide text-ink-mute">Befintlig text i rutan</p>
        <p className="mt-1 text-sm text-ink-soft whitespace-pre-wrap">{slot.shapeText || "(tom)"}</p>
      </div>

      <div>
        <label htmlFor="slot-token" className="block text-sm font-medium text-ink-soft">
          Tokennamn
        </label>
        <input
          id="slot-token"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full border border-rule rounded px-3 py-1.5 text-sm bg-paper"
        />
      </div>

      <div>
        <label htmlFor="slot-intent" className="block text-sm font-medium text-ink-soft">
          Syfte — vad ska AI:n skriva här?
        </label>
        <textarea
          id="slot-intent"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          rows={3}
          maxLength={500}
          className="mt-1 w-full border border-rule rounded px-3 py-1.5 text-sm bg-paper"
        />
      </div>

      <p className="text-xs text-ink-mute">
        Känns igen som <span className="font-medium">{slot.capability}</span>
        {" · "}konfidens: {slot.confidence === "high" ? "hög" : "låg"}.
        Specialiserad fyllning kommer i en senare version — i v1 skrivs innehållet
        som anpassad prosa utifrån syftet ovan.
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving || name.trim().length === 0}
          onClick={() =>
            onDecide({ decision: "confirmed", token: `{${name.trim()}}`, intent })
          }
          className="flex-1 bg-ink text-white py-2 rounded font-medium text-sm
                     hover:bg-accent-ink disabled:opacity-50"
        >
          Bekräfta
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => onDecide({ decision: "skipped" })}
          className="flex-1 border border-rule py-2 rounded font-medium text-sm
                     hover:border-accent disabled:opacity-50"
        >
          Skippa
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Kör SlotPanel-testet — passa**

- [ ] **Step 4: Implementera sidan + wizarden**

```tsx
// src/app/installningar/mallar/[id]/onboarding/page.tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: template } = await supabase
    .from("templates")
    .select("id, name, version, onboarding_status")
    .eq("id", id)
    .maybeSingle();
  if (!template || template.onboarding_status === "none") notFound();

  return (
    <main className="min-h-screen bg-paper">
      <div className="max-w-5xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-display font-normal mb-2">
          Onboarda mall: {template.name} v{template.version}
        </h1>
        <OnboardingWizard templateId={template.id} />
      </div>
    </main>
  );
}
```

```tsx
// src/components/onboarding/OnboardingWizard.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { OnboardingDraft } from "@/lib/pptx-template/onboarding/draft";
import { SlideWireframe, type SlotDecision } from "./SlideWireframe";
import { SlotPanel } from "./SlotPanel";

type WizardData = {
  status: "needs_onboarding" | "classifying" | "draft" | "onboarded";
  draft: OnboardingDraft | null;
  error?: string;
  precount?: { slides: number; candidates: number };
};

const POLL_MS = 3000;

export function OnboardingWizard({ templateId }: { templateId: string }) {
  const [data, setData] = useState<WizardData | null>(null);
  const [slideIdx, setSlideIdx] = useState(0); // index i slides-med-kandidater
  const [selectedShape, setSelectedShape] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/templates/${templateId}/onboarding`);
    if (res.ok) setData(await res.json());
  }, [templateId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Polla under klassificering (bid-genereringens klientmönster).
  useEffect(() => {
    if (data?.status !== "classifying") return;
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [data?.status, refresh]);

  // Slides som kräver beslut — statiska hoppas över i navigeringen.
  const candidateSlides = useMemo(
    () => data?.draft?.wireframe.filter((s) => s.shapes.some((sh) => sh.candidate)) ?? [],
    [data?.draft],
  );
  const slide = candidateSlides[slideIdx] ?? null;

  const slotsOnSlide = useMemo(
    () => (slide ? data!.draft!.slots.filter((s) => s.source === slide.source) : []),
    [slide, data],
  );
  const selectedSlot =
    slotsOnSlide.find((s) => s.shapeIndex === selectedShape) ?? slotsOnSlide[0] ?? null;

  async function startClassification(force = false) {
    setUiError(null);
    const res = await fetch(`/api/templates/${templateId}/onboarding/propose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force }),
    });
    if (!res.ok) setUiError((await res.json()).error ?? "kunde inte starta");
    await refresh();
  }

  async function decide(input: { decision: "confirmed" | "skipped"; token?: string; intent?: string }) {
    if (!selectedSlot) return;
    setSaving(true);
    setUiError(null);
    try {
      const res = await fetch(`/api/templates/${templateId}/onboarding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: selectedSlot.source,
          shapeIndex: selectedSlot.shapeIndex,
          ...input,
        }),
      });
      const body = await res.json();
      if (!res.ok) { setUiError(body.error ?? "kunde inte spara beslutet"); return; }
      setData((d) => (d ? { ...d, draft: body.draft } : d));
    } finally {
      setSaving(false);
    }
  }

  async function complete() {
    setSaving(true);
    setUiError(null);
    try {
      const res = await fetch(`/api/templates/${templateId}/onboarding/complete`, { method: "POST" });
      if (!res.ok) { setUiError((await res.json()).error ?? "kunde inte slutföra"); return; }
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!data) return <p className="text-ink-mute py-12">Laddar…</p>;

  if (data.status === "needs_onboarding") {
    return (
      <div className="border border-rule rounded-lg p-6 space-y-4 max-w-xl">
        {data.error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
            Klassificeringen misslyckades: {data.error}
          </div>
        )}
        <p className="text-sm text-ink-soft">
          Mallen saknar platshållar-tokens. Bidsmith analyserar varje textruta med AI
          och föreslår vad som ska fyllas var — du bekräftar slide för slide.
        </p>
        {data.precount && (
          <p className="text-sm text-ink-soft">
            {data.precount.slides} slides · {data.precount.candidates} textrutor att
            klassificera. Ungefärlig AI-kostnad: under en dollar. Tar någon minut.
          </p>
        )}
        <button
          type="button"
          onClick={() => startClassification(Boolean(data.error))}
          className="bg-ink text-white py-2.5 px-6 rounded-lg font-medium hover:bg-accent-ink"
        >
          {data.error ? "Försök igen" : "Starta klassificering"}
        </button>
      </div>
    );
  }

  if (data.status === "classifying") {
    return (
      <div className="border border-rule rounded-lg p-6 max-w-xl space-y-3">
        <p className="text-sm font-medium">Klassificerar textrutor…</p>
        <p className="text-sm text-ink-mute">
          Sidan uppdateras automatiskt. Tar det mer än ett par minuter kan du{" "}
          <button type="button" className="underline" onClick={() => startClassification(true)}>
            köra om klassificeringen
          </button>.
        </p>
      </div>
    );
  }

  if (data.status === "onboarded") {
    return (
      <div className="border border-rule rounded-lg p-6 max-w-xl space-y-4">
        <p className="text-sm font-medium">Mallen är onboardad och körbar. ✓</p>
        <p className="text-sm text-ink-soft">
          Aktivera den i Inställningar när du vill att nya anbud genereras mot den.
        </p>
        <Link href="/installningar" className="inline-block text-sm font-medium text-accent hover:underline">
          Till Inställningar →
        </Link>
      </div>
    );
  }

  // status === "draft"
  if (!data.draft || candidateSlides.length === 0) {
    return <p className="text-ink-mute py-12">Utkast saknas — kör om klassificeringen från startsidan.</p>;
  }

  const confirmed = data.draft.slots.filter((s) => s.decision === "confirmed").length;
  const pending = data.draft.slots.filter((s) => s.decision === "pending").length;

  if (showSummary) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-display">Sammanfattning</h2>
        <table className="w-full text-sm border border-rule rounded-lg overflow-hidden">
          <thead className="bg-paper-2">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-ink-soft">Slide</th>
              <th className="text-left px-3 py-2 font-medium text-ink-soft">Token</th>
              <th className="text-left px-3 py-2 font-medium text-ink-soft">Syfte</th>
              <th className="text-left px-3 py-2 font-medium text-ink-soft">Beslut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {data.draft.slots.map((s) => (
              <tr key={`${s.source}:${s.shapeIndex}`}>
                <td className="px-3 py-2 text-ink-soft">#{s.source}</td>
                <td className="px-3 py-2">{s.token}</td>
                <td className="px-3 py-2 text-ink-soft">{s.intent}</td>
                <td className="px-3 py-2">
                  {s.decision === "confirmed" ? "Bekräftad" : s.decision === "skipped" ? "Skippad" : "Ej beslutad"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {uiError && <p className="text-sm text-red-700">{uiError}</p>}
        <div className="flex gap-3">
          <button type="button" onClick={() => setShowSummary(false)}
            className="border border-rule py-2 px-4 rounded font-medium text-sm hover:border-accent">
            Tillbaka
          </button>
          <button type="button" onClick={complete} disabled={saving || confirmed === 0}
            title={confirmed === 0 ? "minst en textruta måste bekräftas" : undefined}
            className="bg-ink text-white py-2 px-6 rounded font-medium text-sm hover:bg-accent-ink disabled:opacity-50">
            {saving ? "Slutför…" : `Slutför onboarding (${confirmed} bekräftade)`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Navigeringsremsa */}
      <div className="flex items-center gap-2 flex-wrap text-sm">
        {candidateSlides.map((s, i) => (
          <button key={s.source} type="button"
            onClick={() => { setSlideIdx(i); setSelectedShape(null); }}
            className={`px-2.5 py-1 rounded border text-xs font-medium ${
              i === slideIdx ? "border-accent text-accent" : "border-rule text-ink-soft hover:border-accent"
            }`}>
            Slide {s.source}
          </button>
        ))}
        <span className="ml-auto text-xs text-ink-mute">
          {confirmed} bekräftade · {pending} kvar att besluta
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_20rem] gap-4">
        <SlideWireframe
          slide={slide!}
          slideSize={data.draft.slideSize}
          selectedShapeIndex={selectedSlot?.shapeIndex ?? null}
          decisions={new Map(slotsOnSlide.map((s) => [s.shapeIndex, s.decision as SlotDecision]))}
          onSelect={setSelectedShape}
        />
        {selectedSlot ? (
          <SlotPanel
            key={`${selectedSlot.source}:${selectedSlot.shapeIndex}`}
            slot={selectedSlot}
            onDecide={decide}
            saving={saving}
          />
        ) : (
          <p className="text-sm text-ink-mute">Välj en markerad ruta i wireframen.</p>
        )}
      </div>

      {uiError && <p className="text-sm text-red-700">{uiError}</p>}

      <div className="flex gap-3">
        <button type="button" disabled={slideIdx === 0}
          onClick={() => { setSlideIdx((i) => i - 1); setSelectedShape(null); }}
          className="border border-rule py-2 px-4 rounded font-medium text-sm hover:border-accent disabled:opacity-50">
          ← Föregående
        </button>
        {slideIdx < candidateSlides.length - 1 ? (
          <button type="button"
            onClick={() => { setSlideIdx((i) => i + 1); setSelectedShape(null); }}
            className="bg-ink text-white py-2 px-6 rounded font-medium text-sm hover:bg-accent-ink">
            Nästa slide →
          </button>
        ) : (
          <button type="button" onClick={() => setShowSummary(true)}
            className="bg-ink text-white py-2 px-6 rounded font-medium text-sm hover:bg-accent-ink">
            Till sammanfattningen →
          </button>
        )}
      </div>
    </div>
  );
}
```

OBS filstorlek: OnboardingWizard ovan ligger nära 300-radersgränsen — bryt ut `SummaryView` till egen fil om den passerar.

- [ ] **Step 5: Kör alla komponenttester + typecheck + lint**

Run: `npx vitest run src/components && npx tsc --noEmit && npx next lint`
Expected: PASS

- [ ] **Step 6: Commit** — `feat(onboarding): wizard-sida — start/klassificering/slide-för-slide/sammanfattning`

---

### Task 11: Kedjetest — hela flödet med mockad klassificering

**Files:**
- Test: `src/lib/pptx-template/onboarding/__tests__/onboarding-chain.test.ts`

**Interfaces:**
- Consumes: allt ovan på lib-nivå. Mock av `classifyForeignSlot` — följ mönstret i `propose-injection-plan.test.ts` (läs den först och kopiera dess `vi.mock`-form exakt).

- [ ] **Step 1: Skriv kedjetestet**

```ts
// src/lib/pptx-template/onboarding/__tests__/onboarding-chain.test.ts
import { describe, it, expect, vi } from "vitest";
import { buildMiniPptx } from "../../introspect/__tests__/mini-pptx";
import { readPptxSlides } from "../../introspect/read-pptx";
import { instrumentTemplate } from "../../instrument/instrument-template";
import { isAllGenericProfile, parseTemplateProfile } from "../../template-profile";
import { proposeInjectionPlan } from "../propose-injection-plan";
import { isForeignPptx } from "../detect-foreign";
import { readSlideSize } from "../slide-size";
import { buildDraft, applyDecision, buildInjections, buildFinalProfile } from "../draft-logic";

// Mock: samma modul-specifier som propose-injection-plan.test.ts använder.
vi.mock("../../introspect/classify-slot", () => ({
  classifyForeignSlot: vi.fn(async ({ shapeText }: { shapeText: string }) => ({
    name: shapeText.slice(0, 20) || "Sektion",
    capability: "generic-prose",
    intent: `Fyll i: ${shapeText.slice(0, 30)}`,
    confidence: shapeText.length > 10 ? "high" : "low",
  })),
}));

// Två slides: en med två textboxar (geometri + text), en statisk utan text.
// XML-formen: kopiera shape-strukturen från instrument-template.test.ts fixtures.
const SLIDE_WITH_BOXES = `...`; // se instrument-template.test.ts — <p:sp> med <p:txBody> + <a:xfrm>
const STATIC_SLIDE = `...`;

describe("onboarding-kedjan (mockad klassificering, noll live-API)", () => {
  it("upload-detektering → propose → beslut → instrumentering → slutprofil", async () => {
    const pptx = await buildMiniPptx([SLIDE_WITH_BOXES, STATIC_SLIDE]);
    const slides = await readPptxSlides(pptx);

    // 1. Foreign-detektering
    expect(isForeignPptx(slides)).toBe(true);

    // 2. Propose (klassificeringen mockad)
    const proposal = await proposeInjectionPlan(pptx, {
      templateId: "t-1", name: "kundmall", version: 1, userId: null,
    });
    const draft = buildDraft(proposal.slots, slides, await readSlideSize(pptx));
    expect(draft.slots.length).toBeGreaterThan(0);

    // 3. Beslut: skippa första sloten, redigera + bekräfta resten
    let current = draft;
    const [first, ...rest] = current.slots;
    const skipRes = applyDecision(current, {
      source: first.source, shapeIndex: first.shapeIndex, decision: "skipped",
    });
    expect(skipRes.ok).toBe(true);
    if (skipRes.ok) current = skipRes.draft;
    for (const slot of rest) {
      const res = applyDecision(current, {
        source: slot.source, shapeIndex: slot.shapeIndex,
        decision: "confirmed", intent: "Redigerat syfte",
      });
      expect(res.ok).toBe(true);
      if (res.ok) current = res.draft;
    }

    // 4. Instrumentering — tokens hamnar i rätt shapes
    const injections = buildInjections(current);
    expect(injections.length).toBe(rest.length);
    const instrumented = await instrumentTemplate(pptx, injections);
    const after = await readPptxSlides(instrumented);
    for (const inj of injections) {
      const slide = after.find((s) => s.source === inj.source)!;
      expect(slide.shapes[inj.shapeIndex].tokens).toContain(inj.token);
    }

    // 5. Slutprofil — schemagiltig, all-generic (routing-diskriminatorn)
    const profile = buildFinalProfile(current, { templateId: "t-1", name: "kundmall", version: 1 });
    expect(() => parseTemplateProfile(profile)).not.toThrow();
    expect(isAllGenericProfile(profile)).toBe(true);
    expect(profile.slides).toHaveLength(slides.length); // ALLA slides — inga försvinner
  });
});
```

Slide-XML-fixturerna (`SLIDE_WITH_BOXES`, `STATIC_SLIDE`): kopiera de verkliga `<p:sp>`-strukturerna från `instrument-template.test.ts` (den bygger redan shapes med txBody + xfrm som `readPptxSlides` läser) — hitta inte på egen XML.

- [ ] **Step 2: Kör — passa** (`npx vitest run src/lib/pptx-template/onboarding`)

- [ ] **Step 3: Kör HELA sviten + typecheck + lint**

Run: `npx vitest run && npx tsc --noEmit && npx next lint`
Expected: PASS (kända pre-existerande failures undantagna — notera dem i PR:en om de finns)

- [ ] **Step 4: Commit** — `test(onboarding): kedjetest upload→propose→beslut→instrumentering→profil`

---

### Task 12: ROADMAP + PR

**Files:**
- Modify: `notes/ROADMAP.md`

- [ ] **Step 1: Uppdatera ROADMAP i samma PR** (regeln: statusfilen följer koden)

Under "🔜 NÄSTA": bocka av onboarding-wizarden med en rad i stil med övriga levererade poster (vad, PR-nummer sätts efter PR skapats, datum). Under "Mall-uppladdning": `- [x] Slice 5-UI — onboarding-wizard ... (#NN)`. Lägg kvarvarande residualer som backlog-poster om de inte redan står där (budgetChars för främmande slots står redan; re-onboarding-merge står redan).

- [ ] **Step 2: Push + PR**

```powershell
git push -u origin feat/onboarding-wizard
gh pr create --repo DaVincisfather/bidsmith --title "feat: onboarding-wizard för kundmallar (slice 5-UI)" --body "..."
```

PR-body: sammanfatta flödet, migrationen (012 — Stefan applicerar manuellt FÖRE merge/test i prod-lik miljö), och peka på spec + plan i notes/. Avsluta med 🤖 Generated with [Claude Code](https://claude.com/claude-code).

- [ ] **Step 3: VÄNTA på PR-review-routinen** (aktiv på bidsmith, triggar på nya PR:er) — åtgärda fynd före merge. Kör `/code-review` lokalt som komplement (regressionskänsligt: upload-routen + activate delas med dagens flöde).

- [ ] **Step 4: Efter merge — manuell verifiering (operatör + Claude tillsammans)**

1. Stefan applicerar migration 012 i Supabase SQL Editor.
2. `npm run dev` → ladda upp en riktig tokenlös kundmall → wizarden → klassificera (betalt: under en dollar) → bekräfta/skippa → slutför → aktivera-grinden.
3. PowerPoint-COM-öppning av den instrumenterade kopian (rutinen från 2026-07-03): öppnas utan reparation, tokens syns med ärvd formatering.
4. Generera ett anbud mot den onboardade mallen (profil-vägen, #68) — FailedSection-bannern och skip-blankning fungerar.

---

## Självgranskning (utförd vid plan-skrivning)

- **Spec-täckning:** ingång/auto-detektering (Task 4, 8) · wireframe-vy (Task 9) · intent/namn/skippa (Task 3, 10) · utkast-persistens + resume (Task 1, 5, 6) · async-propose (Task 6) · complete + originalbevarande (Task 7) · aktiverings-grind (Task 7) · felhantering inkl. noll-bekräftade-grinden (Task 3, 7) · test inkl. kedjetest (Task 11) · ROADMAP-regeln (Task 12). Inga spec-krav utan task.
- **Kända osäkerheter för implementatören (verifiera mot kod, inte mot planen):** exakta signaturer i `api-helpers.ts`, `buildMiniPptx`:s default-presentation.xml (Task 2 fallback-test), mock-formen i `propose-injection-plan.test.ts` (Task 11), CSS-token-namnen efter app-restylen (Task 9), TemplateSection-testets render-hjälpare (Task 8).
- **Typkonsistens:** `SlotDecisionInput` (Task 3) = PATCH-body (Task 5) = `decide()`-payload (Task 10); `WireframeSlide`/`slideSize` konsumeras oförändrade av Task 9/10; `TokenInjection` från instrument återanvänds rakt.
