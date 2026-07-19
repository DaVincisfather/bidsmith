import type { SlideShapes } from "../introspect/read-pptx";
import type { TokenInjection } from "../instrument/instrument-template";
import type { ProposedSlot } from "./propose-injection-plan";
import { screenSlides } from "./geometry-screen";
import {
  parseTemplateProfile,
  type TemplateProfile,
  type TableColumnRole,
} from "../template-profile";
import {
  TemplateManifestSchema,
  type TemplateManifest,
} from "../manifest-types";
import {
  parseOnboardingDraft,
  TOKEN_RE,
  type OnboardingDraft,
  type DraftSlot,
  type DraftTable,
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
    // Hög konfidens förbekräftas — MEN static/toc betyder "ska inte fyllas"
    // (kundens footer/innehållsförteckning). En förbockad sådan slot blir tyst
    // AI-överskriven om användaren klickar igenom, så den kräver alltid ett
    // aktivt ställningstagande (pending).
    decision:
      s.confidence === "high" && s.capability !== "static" && s.capability !== "toc"
        ? "confirmed"
        : "pending",
  }));
  const wireframe = slides.map((slide) => ({
    source: slide.source,
    shapes: slide.shapes.map((shape, shapeIndex) => ({
      shapeIndex,
      // Grupperade shapes har grupp-lokal geometri som ritas fel/utanför
      // viewBoxen — droppa den så de hamnar i "Rutor utan position"-listan
      // (fortfarande klickbara). shapeIndex/kandidat-adressering är oförändrad.
      geometry: shape.inGroup ? null : shape.geometry,
      text: shape.paragraphs.join(" ").slice(0, WIREFRAME_TEXT_MAX),
      candidate: candidateKeys.has(`${slide.source}:${shapeIndex}`),
    })),
  }));
  // Främmande a:tbl-tabeller (Task 1's SlideShapes.tables) — trimmad projektion
  // för wizarden: geometri normaliserad till {x,y,cx,cy} (samma form som
  // wireframens shape-geometri; TableShape bär xEmu/yEmu/cxEmu/cyEmu), rader
  // till {heightEmu, cellTexts}. frameIndex bärs igenom OFÖRÄNDRAT — Task 1:s
  // bindande konvention (tät räkning bland graphicFrames MED a:tbl).
  const tables: DraftTable[] = slides.flatMap((slide) =>
    slide.tables.map((t) => ({
      source: slide.source,
      frameIndex: t.frameIndex,
      geometry: t.geometry
        ? { x: t.geometry.xEmu, y: t.geometry.yEmu, cx: t.geometry.cxEmu, cy: t.geometry.cyEmu }
        : null,
      gridColsEmu: t.gridColsEmu,
      rows: t.rows.map((r) => ({ heightEmu: r.heightEmu, cellTexts: r.cells.map((c) => c.text) })),
    })),
  );
  // Validera vår egen hopsättning — fail loud, spegling av proposeInjectionPlan.
  return parseOnboardingDraft({
    draftVersion: 1,
    slideSize,
    slots: draftSlots,
    wireframe,
    // Preliminär geometriskrivning (Task 6) — samma slides som wireframen
    // byggs av, så fynden pekar på exakt de shapes wizarden visar.
    screen: screenSlides(slides),
    tables,
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

export interface TableDecisionInput {
  source: number;
  frameIndex: number;
  headerRows: number;
  templateRowIndex: number;
  columns: TableColumnRole[];
}

/**
 * Ett tabellbeslut in i utkastet — samma validera-sen-kopiera-form som
 * applyDecision, men för en kravmatris-kolumnkarta (se TableMapSchema i
 * template-profile). Bekräftelsereglerna (design 2026-07-19):
 *   - tabellen måste ha läsbar geometri (ärvd/saknad xfrm → null bärs igenom
 *     från buildDraft) — utan bordets topp-position kan computeTablePages
 *     inte pagineras säkert vid render (fallback tableTopEmu ?? 0 skulle
 *     överskatta sidbandet och trycka rader utanför sliden);
 *   - exakt EN krav-kolumn (annars vet radmotorn inte vilken cell som är
 *     kravtexten);
 *   - minst en av uppfyllnad/status (annars finns ingen coverage-signal att
 *     skriva);
 *   - mallraden måste ligga EFTER rubrikraderna och INOM tabellens radantal;
 *   - columns måste täcka varje kolumn (annars vet skrivaren inte vad en
 *     kolumn ska göra).
 * Lyckad validering sätter decision.confirmed=true — buildFinalProfile
 * promotar bara en tabell med confirmed===true till requirement-matrix.
 */
export function applyTableDecision(
  draft: OnboardingDraft,
  input: TableDecisionInput,
): ApplyResult {
  const tables = draft.tables ?? [];
  const idx = tables.findIndex(
    (t) => t.source === input.source && t.frameIndex === input.frameIndex,
  );
  if (idx === -1) {
    return { ok: false, error: `okänd tabell ${input.source}:${input.frameIndex}` };
  }
  const table = tables[idx];
  if (table.geometry === null) {
    return {
      ok: false,
      error: "tabellen saknar läsbar position i mallen — kan inte pagineras säkert; lämna den statisk",
    };
  }
  const kravCount = input.columns.filter((c) => c === "krav").length;
  if (kravCount !== 1) {
    return { ok: false, error: `tabellen måste ha exakt en krav-kolumn (hittade ${kravCount})` };
  }
  if (!input.columns.some((c) => c === "uppfyllnad" || c === "status")) {
    return { ok: false, error: "tabellen måste ha minst en uppfyllnad- eller status-kolumn" };
  }
  if (input.templateRowIndex < input.headerRows) {
    return { ok: false, error: "mallraden kan inte ligga bland rubrikraderna" };
  }
  if (input.templateRowIndex >= table.rows.length) {
    return {
      ok: false,
      error: `mallradsindex ${input.templateRowIndex} finns inte i tabellen (${table.rows.length} rader)`,
    };
  }
  if (input.columns.length !== table.gridColsEmu.length) {
    return {
      ok: false,
      error: `antal kolumnroller (${input.columns.length}) matchar inte tabellens kolumner (${table.gridColsEmu.length})`,
    };
  }
  const nextTables = tables.map((t, i) =>
    i === idx
      ? {
          ...t,
          decision: {
            headerRows: input.headerRows,
            templateRowIndex: input.templateRowIndex,
            columns: input.columns,
            confirmed: true,
          },
        }
      : t,
  );
  return { ok: true, draft: { ...draft, tables: nextTables } };
}

/**
 * Slide-nivå-bulk: alla slidens slots får samma beslut (fast-slide-knappen i
 * wizarden). "skipped" = markera sliden fast (originaltexten behålls —
 * buildInjections instrumenterar bara confirmed); "pending" = ångra, rutorna
 * kräver nytt ställningstagande (tidigare beslut återskapas inte). Ren
 * funktion, återanvänder applyDecision per slot så validering delas.
 */
export function applySlideDecision(
  draft: OnboardingDraft,
  source: number,
  decision: "skipped" | "pending",
): ApplyResult {
  const slideSlots = draft.slots.filter((s) => s.source === source);
  if (slideSlots.length === 0) {
    return { ok: false, error: `slide ${source} har inga textrutor` };
  }
  let current = draft;
  for (const slot of slideSlots) {
    const result = applyDecision(current, {
      source: slot.source,
      shapeIndex: slot.shapeIndex,
      decision,
    });
    if (!result.ok) return result;
    current = result.draft;
  }
  return { ok: true, draft: current };
}

/** Slides där ALLA rutor är skippade = fasta (originaltexten behålls).
 *  Delad av wizarden (fast-knappens läge) och sammanfattningen så regeln
 *  inte driftar mellan ytorna. Stigande ordning. */
export function fastSlideSources(slots: DraftSlot[]): number[] {
  const bySlide = new Map<number, DraftSlot[]>();
  for (const s of slots) {
    const list = bySlide.get(s.source) ?? [];
    list.push(s);
    bySlide.set(s.source, list);
  }
  return [...bySlide.entries()]
    .filter(([, list]) => list.every((s) => s.decision === "skipped"))
    .map(([source]) => source)
    .sort((a, b) => a - b);
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
 * kanoniska tokens); en slide med en BEKRÄFTAD tabellkarta (decision.confirmed
 * — se applyTableDecision) → requirement-matrix + tableMap i st.f. sina slots
 * (tabellen ÄR slidens innehåll; eventuella slot-beslut på samma slide vinner
 * inte över en bekräftad tabell). Slides utan bekräftade slots/tabell → static
 * passthrough — oförändrat från innan tabellstödet.
 */
export function buildFinalProfile(
  draft: OnboardingDraft,
  meta: { templateId: string; name: string; version: number },
): TemplateProfile {
  const confirmed = draft.slots.filter((s) => s.decision === "confirmed");
  const confirmedTables = (draft.tables ?? []).filter((t) => t.decision?.confirmed === true);
  if (confirmed.length === 0 && confirmedTables.length === 0) {
    throw new Error("minst en textruta måste bekräftas");
  }
  const slides = draft.wireframe.map((slide) => {
    // En bekräftad tabell på sliden vinner — v1 stöder EN mappad tabell per
    // slide (SlideProfileSchema bär ett enda tableMap-fält); väljer den
    // FÖRSTA bekräftade om operatören mot förmodan bekräftat flera.
    const table = confirmedTables.find((t) => t.source === slide.source);
    if (table && table.decision) {
      return {
        source: slide.source,
        capability: "requirement-matrix" as const,
        slots: [],
        tableMap: {
          frameIndex: table.frameIndex,
          headerRows: table.decision.headerRows,
          templateRowIndex: table.decision.templateRowIndex,
          columns: table.decision.columns,
        },
      };
    }
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

/**
 * Syntetiskt minimalt manifest för en onboardad FRÄMMANDE mall.
 *
 * VARFÖR: materialize() i template-store kräver ett schemagiltigt
 * templates.manifest för VARJE rad (loadActiveTemplate → loadTemplate anropas
 * utanför try/catch i bid-/export-vägarna). En foreign mall lämnade manifest =
 * null → safeParse-miss → 500 vid varje genereringsförsök. complete-routen
 * skriver därför detta manifest i samma update som statusflippen.
 *
 * Manifestet konsulteras ALDRIG för generering: en foreign mall körs på
 * profil-vägen (isForeignProfile på den sparade profilen är sant — buildFinal
 * Profile mappar varje slide till generic-prose/static, eller requirement-matrix
 * + tableMap för en bekräftad tabell), och den grinden läser profilen, inte
 * manifestet. type "static" per slide håller manifestet utanför type-vägens
 * specialiserade slidelogik även om det någonsin lästes. En static-slide per
 * wireframe-slide räcker för TemplateManifestSchema.min(1); parse:en fail-loud-
 * validerar vår egen hopsättning (spegling av buildFinalProfile).
 */
export function buildForeignManifest(
  draft: OnboardingDraft,
  name: string,
): TemplateManifest {
  return TemplateManifestSchema.parse({
    manifestVersion: 1,
    name,
    slides: draft.wireframe.map((slide) => ({
      source: slide.source,
      type: "static" as const,
      placeholders: [],
    })),
    budgets: {},
    fieldSlides: {},
    excludedSlides: [],
  });
}
