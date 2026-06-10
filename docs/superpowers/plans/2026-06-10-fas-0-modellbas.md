# Fas 0 — Modellbas & API-modernisering: Implementationsplan

> **För agentiska arbetare:** OBLIGATORISK SUB-SKILL: Använd superpowers:subagent-driven-development
> (rekommenderat) eller superpowers:executing-plans för att exekvera denna plan task-för-task.
> Steg använder checkbox-syntax (`- [ ]`) för spårning.

**Mål:** Centraliserat modellregistry, korrekt kostnadsdata, structured outputs istället för
JSON-extraktion ur fritext, samt prompt caching av delad anbudskontext — utan att någon
produktyta ändras.

**Arkitektur:** Allt sker i `src/lib/`. Modellsträngar samlas i `src/lib/models.ts` (roller,
inte strängar). `callClaude()` får `output_config.format` (JSON Schema genererat från befintliga
Zod-scheman via Zod v4:s `z.toJSONSchema` + sanering) och en `cachedContext`-option som renderar
system som blockarray med `cache_control`. Bundlarnas delade kontext flyttas från `userContent`
till `cachedContext`; en `max_tokens: 0`-prewarm per modellgrupp gör att alla sex parallella
bundles läser cachen utan att parallellismen offras.

**Tech-stack:** TypeScript strict, `@anthropic-ai/sdk` ^0.80.0, Zod ^4.3.6, vitest.
Inga nya beroenden.

**Grind för hela fasen:** `npx vitest run` grönt efter varje task. Evals
(`npm run eval:analyzer && npm run eval:matcher && npm run eval:bid-generator`, kräver
`ANTHROPIC_API_KEY` i `.env.local`) körs i Task 4 och Task 6 — de kostar pengar, kör dem inte
per steg.

**Branchstrategi:** Allt arbete på branch `fas-0-modellbas`. En commit per avslutat task-steg
enligt commitstegen nedan.

---

## Förutsättningar (Task 0)

**Filer:** inga ändringar.

- [ ] **Steg 0.1:** `npm install` i repo-roten.
- [ ] **Steg 0.2:** Kör `npx vitest run`. Förväntat: grönt (baslinje). Om något redan är rött —
  STOPPA och rapportera innan ändringar görs.
- [ ] **Steg 0.3:** `git checkout -b fas-0-modellbas`

---

## Task 1: Modellregistry + Opus 4.7 → 4.8

**Filer:**
- Skapa: `src/lib/models.ts`
- Skapa test: `src/lib/__tests__/models.test.ts`
- Ändra: `src/lib/rfp-analyzer.ts:50`, `src/lib/consultant-extractor.ts:43`,
  `src/lib/consultant-matcher.ts:26-27`, `src/lib/go-no-go-evaluator.ts:102`,
  `src/lib/opportunity-scorer.ts:57`,
  `src/lib/bid-generator/bundles/understanding.ts:76`,
  `src/lib/bid-generator/bundles/phases.ts:82`,
  `src/lib/bid-generator/bundles/quality.ts:72`,
  `src/lib/bid-generator/bundles/team.ts:55`,
  `src/lib/bid-generator/bundles/reference.ts:77`,
  `src/lib/bid-generator/bundles/requirement-matrix.ts:78`

Rollmappning (exakt):

| Call-site | Idag | Blir |
|---|---|---|
| `rfp-analyzer.ts` | `"claude-sonnet-4-6"` | `MODELS.extraction` |
| `consultant-extractor.ts` | `"claude-sonnet-4-6"` | `MODELS.extraction` |
| `consultant-matcher.ts` `PREFILTER_MODEL` | `"claude-haiku-4-5-20251001"` | `MODELS.prefilter` |
| `consultant-matcher.ts` `DEEP_MODEL` | `"claude-sonnet-4-6"` | `MODELS.matching` |
| `go-no-go-evaluator.ts` | `"claude-sonnet-4-6"` | `MODELS.gonogo` |
| `opportunity-scorer.ts` | `"claude-haiku-4-5-20251001"` | `MODELS.radar` |
| `understanding/phases/quality.ts` | `"claude-opus-4-7"` | `MODELS.writing` (**= 4.8, modellbytet sker här**) |
| `team/reference/requirement-matrix.ts` | `"claude-sonnet-4-6"` | `MODELS.writingSupport` |

`MODELS.writingChallenger` (Fable 5) och `MODELS.judge` har inga call-sites i `src/` ännu —
de konsumeras av fas 1:s A/B-harness. De definieras nu så att registryt är komplett.

- [ ] **Steg 1.1: Skriv failande test**

```typescript
// src/lib/__tests__/models.test.ts
import { describe, it, expect } from "vitest";
import { MODELS } from "@/lib/models";
import { getModelPricing } from "@/lib/ai-cost";

describe("MODELS registry", () => {
  it("definierar alla roller med giltiga modell-ID-prefix", () => {
    const roles = [
      "extraction", "prefilter", "matching", "gonogo",
      "radar", "writing", "writingSupport", "writingChallenger", "judge",
    ] as const;
    for (const role of roles) {
      expect(MODELS[role]).toMatch(/^claude-/);
    }
  });

  it("skrivande roll är Opus 4.8 tills A/B-test (fas 1) säger annat", () => {
    expect(MODELS.writing).toBe("claude-opus-4-8");
    expect(MODELS.writingChallenger).toBe("claude-fable-5");
  });

  it("varje modell i registryt har en prisrad (ingen fallback-varning)", () => {
    // getModelPricing loggar varning + faller tillbaka på Sonnet-pris för okända
    // modeller — registryt får aldrig peka på en modell utan prisrad.
    for (const model of new Set(Object.values(MODELS))) {
      const p = getModelPricing(model);
      expect(p).toBeDefined();
    }
  });
});
```

OBS: tredje testet blir meningsfullt först efter Task 2 (prisrader). Det får gärna gå grönt
"av fel skäl" (fallback) här — assertionen skärps i Task 2 (steg 2.1).

- [ ] **Steg 1.2: Kör testet, verifiera FAIL**

Kör: `npx vitest run src/lib/__tests__/models.test.ts`
Förväntat: FAIL — `Cannot find module '@/lib/models'`.

- [ ] **Steg 1.3: Implementera registryt**

```typescript
// src/lib/models.ts
// Central modellkonfiguration. Roller, inte strängar — call-sites importerar
// MODELS.<roll> så att ett modellbyte är en enradsändring här plus eval-körning.
// Prisrader för varje modell ska finnas i ai-cost.ts (testat i models.test.ts).
//
// writing avgörs av A/B-harnessen i fas 1 (Opus 4.8 vs Fable 5) — se
// docs/superpowers/plans/2026-06-10-utvecklingsplan-master.md.

export const MODELS = {
  // RFP-analys och konsult-CV-extraktion — mekanisk JSON-strukturering.
  extraction: "claude-sonnet-4-6",
  // Matchning steg 1: scorar hela poolen, endast siffror.
  prefilter: "claude-haiku-4-5-20251001",
  // Matchning steg 2: motiveringar för kortlistan.
  matching: "claude-sonnet-4-6",
  // Go/No-Go-bedömning.
  gonogo: "claude-sonnet-4-6",
  // TED-radar, scoring av upphandlingsnotiser.
  radar: "claude-haiku-4-5-20251001",
  // Kvalitetskritiska skrivbundles: understanding, phases, quality.
  writing: "claude-opus-4-8",
  // Övriga skrivbundles: team, reference, requirement-matrix.
  writingSupport: "claude-sonnet-4-6",
  // Utmanare i A/B-test av anbudstext (fas 1) — ingen produktionsanvändning.
  writingChallenger: "claude-fable-5",
  // LLM-judge i evals. Får aldrig vara samma modell som jämförs.
  judge: "claude-sonnet-4-6",
} as const;

export type ModelRole = keyof typeof MODELS;
```

- [ ] **Steg 1.4: Ersätt call-sites enligt tabellen**

I varje fil: lägg till `import { MODELS } from "@/lib/models";` (i `consultant-matcher.ts`
används relativ import `"./models"` — matcha filens befintliga importstil) och byt
modellsträngen. I `consultant-matcher.ts` ersätts konstantdeklarationerna:

```typescript
const PREFILTER_MODEL = MODELS.prefilter;
const DEEP_MODEL = MODELS.matching;
```

I bundlarna byts `model: "claude-opus-4-7"` → `model: MODELS.writing` osv. Rör inget annat
(surgical changes).

- [ ] **Steg 1.5: Verifiera att inga strängar läckt**

Kör: `npx vitest run` → grönt (models-testets pristest får ge fallback-varning i logg, det
åtgärdas i Task 2). Kör sedan:

```
grep -rn "claude-" src/ --include="*.ts" | grep -v "src/lib/models.ts" | grep -v "src/lib/ai-cost.ts" | grep -v "__tests__"
```

Förväntat: tom output. Testfiler får behålla modellsträngar (de är fixtures), men
`ai-client.test.ts`/`ai-call-logger.test.ts` rör vi inte i denna task.

- [ ] **Steg 1.6: Commit**

```bash
git add src/lib/models.ts src/lib/__tests__/models.test.ts src/lib/rfp-analyzer.ts src/lib/consultant-extractor.ts src/lib/consultant-matcher.ts src/lib/go-no-go-evaluator.ts src/lib/opportunity-scorer.ts src/lib/bid-generator/bundles/
git commit -m "feat: centralt modellregistry, skrivbundles Opus 4.7 -> 4.8"
```

---

## Task 2: Prisuppdatering i ai-cost.ts

**Filer:**
- Ändra: `src/lib/ai-cost.ts:8-13`
- Ändra test: `src/lib/__tests__/ai-cost.test.ts`
- Ändra test: `src/lib/__tests__/models.test.ts` (skärp pristestet)

Aktuella listpriser (USD/MTok in/ut, verifierade 2026-06-10 mot claude-api-skillens
modelltabell): Fable 5 10/50 · Opus 4.8 5/25 · Opus 4.7 5/25 · Opus 4.6 5/25 ·
Sonnet 4.6 3/15 · Haiku 4.5 1/5. Tabellen i koden har 15/75 för Opus 4.7/4.6 — inaktuellt.

- [ ] **Steg 2.1: Uppdatera/skriv failande tester**

I `ai-cost.test.ts`: uppdatera befintliga assertions som räknar med 15/75 för
`claude-opus-4-7` till 5/25, och lägg till:

```typescript
it("prissätter claude-opus-4-8", () => {
  expect(getModelPricing("claude-opus-4-8")).toEqual({ inputPerMTok: 5, outputPerMTok: 25 });
});

it("prissätter claude-fable-5", () => {
  expect(getModelPricing("claude-fable-5")).toEqual({ inputPerMTok: 10, outputPerMTok: 50 });
});
```

I `models.test.ts`: skärp pristestet så fallback räknas som fel:

```typescript
import { vi } from "vitest";

it("varje modell i registryt har en egen prisrad (ingen fallback)", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  for (const model of new Set(Object.values(MODELS))) {
    getModelPricing(model);
  }
  expect(warn).not.toHaveBeenCalled();
  warn.mockRestore();
});
```

OBS: `getModelPricing` varnar bara en gång per modell (`warnedModels`-set). Anropa
`_resetWarnedModelsForTests()` i `beforeEach` (exporteras redan från `ai-cost.ts`).

- [ ] **Steg 2.2: Kör testerna, verifiera FAIL**

Kör: `npx vitest run src/lib/__tests__/ai-cost.test.ts src/lib/__tests__/models.test.ts`
Förväntat: FAIL — opus-4-8/fable-5 saknar prisrad; 4.7-priset fel.

- [ ] **Steg 2.3: Uppdatera pristabellen**

```typescript
// Anthropic list prices (USD per 1M tokens). Last verified: 2026-06-10.
// Update here when Anthropic publishes new prices.
const PRICING: Record<string, ModelPricing> = {
  "claude-fable-5": { inputPerMTok: 10, outputPerMTok: 50 },
  "claude-opus-4-8": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-opus-4-7": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-opus-4-6": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-haiku-4-5-20251001": { inputPerMTok: 1, outputPerMTok: 5 },
};
```

- [ ] **Steg 2.4: Kör testerna, verifiera PASS** — `npx vitest run` → allt grönt.

- [ ] **Steg 2.5: Commit**

```bash
git add src/lib/ai-cost.ts src/lib/__tests__/ai-cost.test.ts src/lib/__tests__/models.test.ts
git commit -m "fix: prisrader for Opus 4.8 + Fable 5, korrigera Opus 4.7/4.6 till 5/25"
```

---

## Task 3: Structured outputs i callClaude

**Filer:**
- Skapa: `src/lib/structured-output-schema.ts`
- Skapa test: `src/lib/__tests__/structured-output-schema.test.ts`
- Ändra: `src/lib/ai-client.ts` (request-bygget, rad ~74-85)
- Ändra test: `src/lib/__tests__/ai-client.test.ts` (nya payload-assertions)

**Designbeslut:**
- Zod v4:s `z.toJSONSchema()` genererar schemat — inget nytt paket.
- Structured outputs stöder INTE numeriska/sträng-/array-constraints (`minimum`, `maximum`,
  `minItems`, `maxItems`, `minLength`, `maxLength`, `pattern`, `multipleOf`) och kräver
  `additionalProperties: false` på alla objekt. Befintliga scheman använder sådana constraints
  (t.ex. `UnderstandingBundleSchema`: `.min(1).max(4)`, `.length(3)`; `PrefilterSchema`:
  `.min(0).max(100)`). Därför: en saneringshjälpare som strippar ej stödda nyckelord och
  tvingar `additionalProperties: false` — Zod-`safeParse` klient-side (finns redan i
  `parseAndValidate`) fortsätter upprätthålla constraints.
- API:t garanterar då att första textblocket är giltig JSON → `extractJson()` blir passthrough
  (ren JSON börjar med `{`), `ResponseFormatError`-retryn behålls som skyddsnät.
- Nödlucka: `BIDSMITH_STRUCTURED_OUTPUTS=off` i env stänger av `format` (behåller gamla
  beteendet) om API:t skulle avvisa något schema i drift. Tas bort i fas 1 om oanvänd.
- Känd egenhet: första anropet med ett nytt schema har engångs-kompileringslatens;
  schema-cache hos Anthropic är 24 h. `z.toJSONSchema` kastar på Zod-typer utan
  JSON-motsvarighet (t.ex. `z.date()`, `z.bigint()`) — inget schema i `ai-schemas.ts` eller
  bundlarna använder sådana; om det ändå inträffar är felet högljutt vid första anropet,
  inte tyst.

- [ ] **Steg 3.1: Skriv failande tester för saneringshjälparen**

```typescript
// src/lib/__tests__/structured-output-schema.test.ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { toStructuredOutputSchema } from "@/lib/structured-output-schema";

describe("toStructuredOutputSchema", () => {
  it("strippar constraints som structured outputs inte stoder", () => {
    const schema = z.object({
      items: z.array(z.string().min(2)).min(1).max(4),
      score: z.number().min(0).max(100),
    });
    const json = JSON.stringify(toStructuredOutputSchema(schema));
    for (const kw of ["minItems", "maxItems", "minimum", "maximum", "minLength", "maxLength"]) {
      expect(json).not.toContain(`"${kw}"`);
    }
  });

  it("tvingar additionalProperties: false pa alla objektnivaer", () => {
    const schema = z.object({ outer: z.object({ inner: z.string() }) });
    const result = toStructuredOutputSchema(schema) as {
      additionalProperties: boolean;
      properties: { outer: { additionalProperties: boolean } };
    };
    expect(result.additionalProperties).toBe(false);
    expect(result.properties.outer.additionalProperties).toBe(false);
  });

  it("bevarar struktur, enum och required", () => {
    const schema = z.object({
      level: z.enum(["junior", "senior"]),
      name: z.string(),
    });
    const result = toStructuredOutputSchema(schema) as {
      required: string[];
      properties: { level: { enum: string[] } };
    };
    expect(result.required).toEqual(expect.arrayContaining(["level", "name"]));
    expect(result.properties.level.enum).toEqual(["junior", "senior"]);
  });

  it("klarar ett verkligt produktionsschema (smoke)", () => {
    // Importeras härifrån för att fånga inkompatibilitet tidigt — kastar
    // toStructuredOutputSchema på något verkligt schema ska det synas i test,
    // inte i drift.
    const { UnderstandingBundleSchema } = await import(
      "@/lib/bid-generator/bundles/understanding"
    );
    expect(() => toStructuredOutputSchema(UnderstandingBundleSchema)).not.toThrow();
  });
});
```

(Gör testfunktionen `async` för smoke-testet, eller använd statisk import — välj det som
lintar rent.)

- [ ] **Steg 3.2: Kör, verifiera FAIL** — `Cannot find module '@/lib/structured-output-schema'`.

- [ ] **Steg 3.3: Implementera saneringshjälparen**

```typescript
// src/lib/structured-output-schema.ts
import { z } from "zod";

// Nyckelord som Anthropic structured outputs avvisar. Constraints upprätthålls
// ändå klient-side av Zod-safeParse i ai-client.ts — här tas de bara bort ur
// det schema som skickas till API:t.
const UNSUPPORTED_KEYWORDS = new Set([
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
  "minLength", "maxLength", "pattern",
  "minItems", "maxItems", "uniqueItems",
]);

function sanitize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitize);
  if (node === null || typeof node !== "object") return node;

  const obj = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) continue;
    out[key] = sanitize(value);
  }
  if (out.type === "object") {
    out.additionalProperties = false;
  }
  return out;
}

// Konverterar ett Zod-schema till JSON Schema kompatibelt med Anthropics
// output_config.format. Kastar om schemat innehåller Zod-typer utan
// JSON-motsvarighet — det ska smälla i test, inte tyst i drift.
export function toStructuredOutputSchema(
  schema: z.ZodType,
): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12" });
  return sanitize(json) as Record<string, unknown>;
}
```

Verifiera signaturen `z.toJSONSchema(schema, options)` mot installerad Zod-version
(`node_modules/zod`) vid implementation — options-objektet kan utelämnas om `target`-defaulten
redan är draft 2020-12.

- [ ] **Steg 3.4: Kör, verifiera PASS** — `npx vitest run src/lib/__tests__/structured-output-schema.test.ts`

- [ ] **Steg 3.5: Skriv failande payload-test för callClaude**

Lägg i `ai-client.test.ts` (samma mockmönster som befintliga tester — `mockStream` +
`streamOf`):

```typescript
describe("callClaude — structured outputs", () => {
  const schema = z.object({ a: z.number().min(0) });
  const okResponse = streamOf({
    content: [{ type: "text", text: '{"a": 1}' }],
    usage: {},
  });

  it("skickar output_config.format med sanerat JSON Schema", async () => {
    mockCreate.mockReturnValue(okResponse);
    await callClaude({ ...baseArgs, schema });
    const payload = mockCreate.mock.calls[0][0];
    expect(payload.output_config.format.type).toBe("json_schema");
    expect(payload.output_config.format.schema.additionalProperties).toBe(false);
    expect(JSON.stringify(payload.output_config.format.schema)).not.toContain("minimum");
  });

  it("kombinerar format med effort i samma output_config", async () => {
    mockCreate.mockReturnValue(okResponse);
    await callClaude({ ...baseArgs, schema, effort: "high" });
    const payload = mockCreate.mock.calls[0][0];
    expect(payload.output_config.effort).toBe("high");
    expect(payload.output_config.format.type).toBe("json_schema");
    expect(payload.thinking).toEqual({ type: "adaptive" });
  });

  it("utelamnar format nar BIDSMITH_STRUCTURED_OUTPUTS=off", async () => {
    vi.stubEnv("BIDSMITH_STRUCTURED_OUTPUTS", "off");
    mockCreate.mockReturnValue(okResponse);
    await callClaude({ ...baseArgs, schema });
    const payload = mockCreate.mock.calls[0][0];
    expect(payload.output_config?.format).toBeUndefined();
    vi.unstubAllEnvs();
  });
});
```

OBS: befintligt test `"omits thinking + output_config when effort is not set"`
(`ai-client.test.ts:169`) blir inaktuellt — `output_config` skickas nu alltid (med `format`).
Uppdatera det till att assertera att `thinking` utelämnas och `output_config.effort` är
`undefined` när `effort` inte satts.

- [ ] **Steg 3.6: Kör, verifiera FAIL** — payloaden saknar `output_config.format`.

- [ ] **Steg 3.7: Wira in i callClaude**

I `ai-client.ts`, ersätt request-bygget (rad ~74-85):

```typescript
import { toStructuredOutputSchema } from "@/lib/structured-output-schema";

// ... inne i callClaude, före retry-loopen:
const useStructuredOutputs = process.env.BIDSMITH_STRUCTURED_OUTPUTS !== "off";
const outputConfig: Record<string, unknown> = {
  ...(effort ? { effort } : {}),
  ...(useStructuredOutputs
    ? { format: { type: "json_schema", schema: toStructuredOutputSchema(schema) } }
    : {}),
};

// ... i stream-anropet:
const stream = getClient().messages.stream({
  model,
  max_tokens: maxTokens,
  system,
  messages: [{ role: "user", content: userContent }],
  ...(effort ? { thinking: { type: "adaptive" as const } } : {}),
  ...(Object.keys(outputConfig).length > 0 ? { output_config: outputConfig } : {}),
});
```

Beräkna `toStructuredOutputSchema(schema)` EN gång före retry-loopen, inte per attempt.
`extractJson` + `parseAndValidate` lämnas orörda — med format-garanti blir extraktionen
passthrough, och utan (env off) fungerar allt som idag. Om SDK-typerna för `output_config.format`
saknas i ^0.80.0: uppgradera `@anthropic-ai/sdk` till senaste minor och kör om testsviten,
istället för att type-casta runt det.

- [ ] **Steg 3.8: Kör hela sviten, verifiera PASS** — `npx vitest run`.

- [ ] **Steg 3.9: Commit**

```bash
git add src/lib/structured-output-schema.ts src/lib/__tests__/structured-output-schema.test.ts src/lib/ai-client.ts src/lib/__tests__/ai-client.test.ts
git commit -m "feat: structured outputs via output_config.format i callClaude"
```

---

## Task 4: Eval-grind A (structured outputs får inte ändra kvalitet)

**Filer:** inga ändringar — verifiering.

- [ ] **Steg 4.1:** Kör `npm run eval:analyzer` → alla fixtures PASS mot `evals/thresholds.yaml`.
- [ ] **Steg 4.2:** Kör `npm run eval:matcher` → PASS.
- [ ] **Steg 4.3:** Kör `npm run eval:bid-generator` → PASS. Detta validerar samtidigt
  Opus 4.8-bytet från Task 1.
- [ ] **Steg 4.4:** Kontrollera run-dumparna i `evals/runs/`: antalet format-omkörningar
  (ResponseFormatError-retries) ska vara noll eller nära noll. Notera kostnad/tokens per
  modul — detta är **kostnadsbaslinjen före caching**.
- [ ] **Steg 4.5:** Om någon eval FAIL: felsök med superpowers:systematic-debugging innan
  vidare arbete. Misstänkt först: ett schema som API:t avvisar (400) → kör om med
  `BIDSMITH_STRUCTURED_OUTPUTS=off` för att isolera, rapportera schema-felet.
- [ ] **Steg 4.6:** Commit av ev. run-artefakter enligt repots befintliga konvention för
  `evals/runs/` (kolla `.gitignore` — om runs ignoreras, skippa commit).

---

## Task 5: Prompt caching — cachedContext + prewarm

**Filer:**
- Ändra: `src/lib/ai-client.ts` (`CallClaudeOptions`, system-rendering, ny export `prewarmContextCache`)
- Ändra test: `src/lib/__tests__/ai-client.test.ts`
- Ändra: alla sex bundle-filer i `src/lib/bid-generator/bundles/`
- Ändra: `src/lib/bid-generator/index.ts` (prewarm före parallell dispatch)

**Designbeslut (läs innan implementation):**
- Cache är prefixmatchning i ordningen tools → system → messages. Bundlarna har OLIKA
  system-prompts men DELAR `formatContext(ctx)`. Därför flyttas den delade kontexten till
  ett FÖRSTA system-block med `cache_control`, och den bundle-specifika prompten blir
  system-block två. Prefixet (block 1) är då byte-identiskt över alla sex bundles —
  `formatContext` är en ren funktion av ctx, så identiteten är garanterad.
- Cachen är modellskopad: Opus-trion (understanding/phases/quality) och Sonnet-trion
  (requirement-matrix/team/reference) har separata cacher.
- Bundlarna körs parallellt (`Promise.allSettled` i `bid-generator/index.ts`) — parallella
  anrop kan inte läsa en cache som håller på att skrivas. Lösning: en
  **`max_tokens: 0`-prewarm per modellgrupp** (dokumenterat mönster för cache-förvärmning)
  innan dispatch. Kostar sekunder och en cache-write (1,25×), inte en hel bundle-körning.
  Prewarm-anropet får INTE innehålla `output_config.format` eller `thinking`
  (avvisas med `max_tokens: 0`) — det spelar ingen roll för cachen, som ligger i system-blocket.
- `withBudgetRetry` muterar bundle-prompten vid overflow-retry — den ligger i block 2,
  så block 1-cachen överlever retries. Samma sak för format-retries.
- Minsta cachebara prefix: 4096 tokens (Opus 4.8), 2048 (Sonnet 4.6). Är `formatContext`
  mindre än så cachas inget — tyst och ofarligt, prewarm-anropet kostar då nästan inget.

- [ ] **Steg 5.1: Skriv failande payload-tester**

```typescript
describe("callClaude — cachedContext", () => {
  const schema = z.object({ a: z.number() });
  const okResponse = streamOf({
    content: [{ type: "text", text: '{"a": 1}' }],
    usage: {},
  });

  it("renderar system som blockarray med cache_control pa kontextblocket", async () => {
    mockCreate.mockReturnValue(okResponse);
    await callClaude({ ...baseArgs, schema, cachedContext: "STOR DELAD KONTEXT" });
    const payload = mockCreate.mock.calls[0][0];
    expect(payload.system).toEqual([
      {
        type: "text",
        text: "STOR DELAD KONTEXT",
        cache_control: { type: "ephemeral" },
      },
      { type: "text", text: "sys" },
    ]);
  });

  it("behaller system som strang utan cachedContext", async () => {
    mockCreate.mockReturnValue(okResponse);
    await callClaude({ ...baseArgs, schema });
    expect(mockCreate.mock.calls[0][0].system).toBe("sys");
  });
});
```

För `prewarmContextCache` behövs en mock även för `messages.create` (prewarm streamar inte):
utöka SDK-mocken med `create: mockCreatePlain` bredvid `stream`.

```typescript
describe("prewarmContextCache", () => {
  it("skickar max_tokens 0 med cachat systemblock, utan format/thinking", async () => {
    mockCreatePlain.mockResolvedValue({ usage: {} });
    await prewarmContextCache("claude-opus-4-8", "KONTEXT");
    const payload = mockCreatePlain.mock.calls[0][0];
    expect(payload.max_tokens).toBe(0);
    expect(payload.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(payload.output_config).toBeUndefined();
    expect(payload.thinking).toBeUndefined();
  });

  it("svaljer fel — prewarm far aldrig falla en generering", async () => {
    mockCreatePlain.mockRejectedValue(new Error("boom"));
    await expect(prewarmContextCache("claude-opus-4-8", "KONTEXT")).resolves.toBeUndefined();
  });
});
```

- [ ] **Steg 5.2: Kör, verifiera FAIL.**

- [ ] **Steg 5.3: Implementera i ai-client.ts**

`CallClaudeOptions` får `cachedContext?: string`. I stream-anropet:

```typescript
system: cachedContext
  ? [
      {
        type: "text" as const,
        text: cachedContext,
        cache_control: { type: "ephemeral" as const },
      },
      { type: "text" as const, text: system },
    ]
  : system,
```

Ny export:

```typescript
// Förvärmer prompt-cachen för en modell genom ett max_tokens: 0-anrop med
// enbart det delade kontextblocket. Körs en gång per modellgrupp innan
// parallella bundle-anrop så att de läser cachen istället för att alla
// betala fullpris. Fel sväljs — värmning får aldrig fälla en generering.
export async function prewarmContextCache(
  model: string,
  cachedContext: string,
): Promise<void> {
  try {
    await getClient().messages.create({
      model,
      max_tokens: 0,
      system: [
        {
          type: "text" as const,
          text: cachedContext,
          cache_control: { type: "ephemeral" as const },
        },
      ],
      messages: [{ role: "user", content: "warmup" }],
    });
  } catch {
    // Avsiktligt tyst — cache-miss är bara dyrare, inte fel.
  }
}
```

Om SDK:t avvisar `max_tokens: 0` klient-side (validering i ^0.80.0): uppgradera SDK:t;
fungerar det ändå inte, fall tillbaka på `max_tokens: 1` och notera i koden varför.

- [ ] **Steg 5.4: Kör, verifiera PASS.**

- [ ] **Steg 5.5: Flytta delad kontext i alla sex bundles**

I varje bundle-fil (mönstret är identiskt — exempel `understanding.ts`):

```typescript
callClaude({
  model: MODELS.writing,
  maxTokens: 32000,
  system: p,
  cachedContext: formatContext(ctx),
  userContent: "Generera JSON-payloaden enligt systeminstruktionerna.",
  schema: UnderstandingBundleSchema,
  label: "understanding bundle",
  effort: "max",
  userId: ctx.userId,
}),
```

Kontexten lämnar alltså `userContent` (idag `formatContext(ctx)`) och blir `cachedContext`;
`userContent` blir den fasta instruktionsraden ovan i alla sex filer.

- [ ] **Steg 5.6: Prewarm i bid-generator/index.ts**

Före `Promise.allSettled`-dispatchen:

```typescript
import { prewarmContextCache } from "@/lib/ai-client";
import { MODELS } from "@/lib/models";
import { formatContext } from "./context";

// ... inne i generateAllSections, efter loadBudgets:
const sharedContext = formatContext(ctx);
// En värmning per modellgrupp — cachen är modellskopad. Sekunder, inte minuter:
// max_tokens 0 returnerar direkt efter prefill.
await Promise.allSettled([
  prewarmContextCache(MODELS.writing, sharedContext),
  prewarmContextCache(MODELS.writingSupport, sharedContext),
]);
```

Befintlig dispatch och `BUNDLE_LABELS`-ordningen rörs inte.

- [ ] **Steg 5.7: Kör hela sviten** — `npx vitest run` grönt. Kontrollera även att inga
  bundle-tester i `src/lib/bid-generator/__tests__/` asserterar på gamla
  `userContent`-innehållet (uppdatera i så fall).

- [ ] **Steg 5.8: Commit**

```bash
git add src/lib/ai-client.ts src/lib/__tests__/ai-client.test.ts src/lib/bid-generator/
git commit -m "feat: prompt caching av delad anbudskontext + prewarm per modellgrupp"
```

---

## Task 6: Eval-grind B + cacheverifiering + kostnadsbaslinje

**Filer:** Skapa `docs/superpowers/plans/2026-06-10-fas-0-resultat.md`

- [ ] **Steg 6.1:** Kör alla tre evals igen → PASS. (bid-generator-evalen går nu genom
  cachedContext-vägen.)
- [ ] **Steg 6.2: Cacheverifiering på riktigt anbud.** Generera ett anbud end-to-end i
  dev-miljön (syntetisk data från `data/synthetic/`). Kontrollera i `ai_call_logs`:
  - De sex bundle-anropen + 2 prewarm-rader finns.
  - `cache_read_input_tokens > 0` för bundle-anropen i respektive modellgrupp
    (alla tre i gruppen läser — prewarm skrev).
  - Om `cache_read_input_tokens = 0` överallt: kontrollera att `formatContext`-utfallet
    når minsta cachebara prefix (4096 tokens Opus / 2048 Sonnet) genom att räkna tokens
    på kontextsträngen; under gränsen är utfallet förväntat och OK — dokumentera det.
    Annars: leta tyst invalidator (något som gör kontextsträngen icke-identisk mellan
    prewarm och bundles).
- [ ] **Steg 6.3: Skriv resultatdokumentet** med: kostnad/anbud före (Task 4-baslinjen,
  utan caching) och efter (Task 6-körningen), antal format-retries före/efter structured
  outputs, cache-träffandel, samt eventuella avvikelser. Detta är baslinjen som fas 1
  (A/B-test) och fas 6 (Batch API) jämför mot.
- [ ] **Steg 6.4: Uppdatera CLAUDE.md** §Modellstrategi: Opus 4.8 för skrivbundles,
  hänvisning till `src/lib/models.ts` som enda sanningskälla, notera structured
  outputs + caching i §Projektspecifika gotchas (`callClaude` tar `cachedContext`;
  prewarm i `bid-generator/index.ts`).
- [ ] **Steg 6.5: Commit + push**

```bash
git add docs/superpowers/plans/2026-06-10-fas-0-resultat.md CLAUDE.md
git commit -m "docs: fas 0-resultat med kostnadsbaslinje, uppdaterad modellstrategi"
git push -u origin fas-0-modellbas
```

- [ ] **Steg 6.6:** Öppna PR mot `main` med sammanfattning av: registry, prisfix,
  structured outputs, caching, eval-resultat före/efter. Använd
  superpowers:finishing-a-development-branch.

---

## Definition of done (hela fas 0)

1. `npx vitest run` grönt; alla tre evals PASS mot `evals/thresholds.yaml`.
2. `grep -rn "claude-" src/` träffar endast `models.ts`, `ai-cost.ts` och testfixtures.
3. Skrivbundles kör `claude-opus-4-8`; `ai-cost.ts` prissätter alla registry-modeller
   utan fallback-varning.
4. Ett anbud genererat end-to-end; `ai_call_logs` visar `cache_read_input_tokens > 0`
   för bundle-anrop (eller dokumenterat att kontexten ligger under cache-minimum).
5. Noll format-retries i eval-körningarna.
6. `2026-06-10-fas-0-resultat.md` finns med kostnadsbaslinje före/efter.
7. PR öppnad mot `main`.

## Kända risker i denna fas

| Risk | Hantering |
|---|---|
| API:t avvisar något sanerat schema (400) | Nödlucka `BIDSMITH_STRUCTURED_OUTPUTS=off`; smoke-test i Task 3 fångar konverteringsfel före drift |
| `z.toJSONSchema`-options skiljer i installerad Zod-minor | Verifiera mot `node_modules/zod` i steg 3.3 — gissa inte signaturen |
| SDK ^0.80.0 saknar typer för `output_config.format` eller avvisar `max_tokens: 0` | Uppgradera SDK:t (minor), kör om hela sviten — type-casta inte runt |
| Kontext under cache-minimum → inga träffar | Förväntat utfall för små RFP:er; dokumenteras i resultatfilen, ingen åtgärd |
| Kvalitetsskift av att kontexten flyttar från user till system | Eval-grind B (Task 6) — coverage/hallucination-dimensionerna fångar regressioner |
