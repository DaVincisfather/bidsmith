# Spec: Auto-korta per ruta (mall-overflow Task 3)

**Datum:** 2026-07-02 · **Branch:** `feat/auto-shorten-field`

## Bakgrund

Task 1 gav ärliga budgetar, Task 2 ärlig overflow-vy. Kvar av Stefans produktbeslut
(2026-07-01): *"behåll text, knapp 'korta ner åt mig' som skriver om just det fältet ≤ tak."*
Idag flaggar `OverflowChecklist` för långa fält (skrivet/tak, hoppa-till-fält) men användaren
måste korta manuellt.

## Mål

En knapp per flaggat fält i `OverflowChecklist` som skriver om just det fältets text till
≤ tak via skrivmodellen, applicerar resultatet i editorn och räknar om flaggan.

## Beslut (Stefan 2026-07-02)
- **Modell:** `MODELS.writingSupport` (Sonnet) — förkortning är lättare än författande,
  kostnadstrappat.
- **Överskott:** om svaret > tak → retry 1× med strängare instruktion; om fortfarande över,
  behåll bästa försöket (fältet stannar flaggat). **Aldrig hård trunkering** (bevarar mening).

## Design

### 1. Path-util (`src/lib/bid-editor/field-path.ts`, ren + testad)
`getFieldValue(content, path)` och `setFieldValue(content, path, value)` för konkreta
resolved-paths som `OverflowFlag.fieldPath` producerar: `"phases[0].objective"`,
`"phases[1].activities[3]"`, `"rows[2].requirement"`, `"checkpoints[0]"`.
- Parsar segment: `namn` och `[index]`. `setFieldValue` returnerar en ny (djup-klonad längs
  vägen) struktur — muterar inte originalet (React-immutabilitet). Saknad väg → get returnerar
  `undefined`, set no-op (returnerar oförändrat) — defensivt, inga krascher.

### 2. Schema (`src/lib/ai-schemas.ts`)
`ShortenedTextSchema = z.object({ text: z.string().min(1) })`.

### 3. API `POST /api/bids/[id]/shorten`
- Auth + bid-scope som övriga `/api/bids/[id]/`-routes (supabase server client).
- Body (Zod-validerad): `{ text: string, budget: number (int, positiv), fieldLabel: string }`.
- `callClaude({ model: MODELS.writingSupport, schema: ShortenedTextSchema, temperature: 0,
  label: "shorten-field", bidId, system, userContent })`.
  - System: skriv om svensk anbudstext till ≤ N tecken, bevara innebörd/ton/fackspråk, hela
    meningar, ingen avhuggning mitt i.
  - Verifiera `result.text.length <= budget`. Om över → 1 retry med
    `userContent` + strängare påpekande ("förra svaret var X tecken, max N"). Returnera bästa
    (kortaste giltiga, annars kortaste) — aldrig trunkera.
- Svar: `{ text, length, budget, withinBudget }`.

### 4. UI
- `OverflowChecklist`: ny valfri `onShorten?(flag)`-prop + `shorteningKey`-state (vilket fält
  körs). Per flagg-rad: knapp "Korta ner åt mig" (spinner + disabled medan den körs).
- `BidEditor.onShorten(flag)`:
  1. Hitta sektionen vars `content` innehåller `flag.fieldPath` (via `getFieldValue`).
  2. `POST /api/bids/[id]/shorten` med `{ text, budget: flag.budget, fieldLabel }`.
  3. `setFieldValue` in i klonat sektion-content → `handleSectionChange` (recompute + autosave).
  4. Per-fält loading/fel-state; nätfel visas i befintlig felruta.

## Icke-mål (YAGNI)
- Ingen "korta alla"-knapp (en ruta i taget; kan komma senare).
- Ingen full anbudskontext till modellen (bara fält-text + etikett + tak).
- Ingen ändring av budgetmotorn eller upload-vyn.

## Testning (TDD)
- Path-util: get/set för nästlade + array-index-paths; immutabilitet; saknad väg.
- API-route: mockad `callClaude` → returnerar ≤ tak; överskott → retry-väg (mock ger först
  för långt, sen kort); bevarar bästa; auth-fel; ogiltig body.
- `OverflowChecklist`: knapp renderas per flagg, anropar `onShorten`, spinner vid körning.
- Hela sviten + `tsc --noEmit` grön.
