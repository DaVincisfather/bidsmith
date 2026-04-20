# PPTX Template Placeholder Convention

Templates in `templates/` use literal `{Label}` placeholders in shape text frames. The renderer matches these by **exact text content** (not shape names) using `pptx-automizer`'s text replacement.

## Rules

1. **Placeholder syntax:** `{Label}` — curly braces around a Swedish label.
2. **Per-instance suffix:** Numbered placeholders within one slide (e.g., `{Aktivitet 1}`, `{Aktivitet 2}`) — the applicator iterates and fills/hides per-data-item.
3. **Uniqueness:** Each `{Label}` must be unique within its slide. If you need the same data in two places, design the template with one canonical placeholder.
4. **Hide-on-empty:** When the data array is shorter than the placeholder count, the applicator removes the unused text frames (NOT just blanks them — empty frames look weird in the output deck).
5. **No conditionals in template:** Templates have no `{{#if}}`-style logic. All conditional rendering lives in TypeScript applicators.

## Adding a new template

1. Design `.pptx` in PowerPoint (or claude.ai design / Anthropic Artifacts).
2. Use `{Label}` placeholders for any data-driven text. Match the convention used in `templates/anbudsmall-v2.pptx` for consistency.
3. Save to `templates/<template-id>.pptx`.
4. Create `templates/<template-id>.config.ts` exporting a `TemplateConfig` (see `src/lib/pptx-template/types.ts`).
5. Register in `src/lib/pptx-template/registry.ts`.

## Slide types and applicators

Each `TemplateConfig.slides[]` entry maps a 1-based source slide index to one of the supported applicator types:

- `cover` — single-instance text replacement (company, bid, date, diary)
- `toc` — dynamic entries list, hide unused rows
- `prose` — single text frame replacement (understanding-current/assignment/vision)
- `phases-overview` — up to N phase cards + Gantt timeline (v1: hard cap 4)
- `phase-detail` — cloned per phase; per-phase placeholder fill + hide unused list items
- `quality-assurance` — bullets list with hide-on-empty
- `team-pricing` — table with row-per-member
- `requirement-matrix` — table with rows-per-requirement and dynamic columns
- `reference` — cloned per reference
- `confidentiality` — static + signer rows
- `certifications` — logo grid with hide-on-empty

Each applicator owns its placeholder semantics — see `src/lib/pptx-template/applicators/<type>.ts` for the contract per type.

## Cloning vs static slides

Slides marked with `cloneFrom: "phases" | "references"` in the registry are cloned once per data-array item. Source slides 8–10 (illustrative phase-detail copies in the mockup) and slide 15 (illustrative reference copy) are NOT rendered — they exist in the mockup `.pptx` only as visual references for the designer.

## Why text-content matching, not shape names

PowerPoint shape names default to `Text 1`, `Shape 2`, etc. — not semantic. Renaming every shape would be manual setup work per template. Text-content matching (`{Label}`) lets the designer work in PowerPoint without touching the XML, and lets the applicator find what to replace by reading what the template author already typed.

The tradeoff: each placeholder must be unique within its slide. This is enforceable at template-creation time and matches how Stefan's mockup `Anbudsmall-v2.pptx` was already authored.
