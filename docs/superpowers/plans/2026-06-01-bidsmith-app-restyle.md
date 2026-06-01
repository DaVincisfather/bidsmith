# Bidsmith App Restyle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the entire Bidsmith web app from default Tailwind/Geist to the decided Bidsmith visual identity (Junto DNA, rebranded): warm paper, burgundy accent, Fraunces / Inter Tight / JetBrains Mono, anvil mark.

**Architecture:** Tailwind v4 is CSS-first (no config file) — so the foundation is a token layer in `globals.css` (`@theme`) that exposes Bidsmith colors and fonts as utilities (`bg-paper`, `text-ink`, `text-accent`, `font-display`). Fonts are swapped in `layout.tsx` via `next/font`. Then each route's inline-styled components are migrated from the old vocabulary (`bg-white`, `gray-*`, `bg-gray-900`) to the new tokens via a single authoritative **Restyle Conventions** mapping, so per-component work is mechanical and consistent.

**Tech Stack:** Next.js 16 (App Router), Tailwind v4 (CSS-first `@theme`), `next/font/google`, gstack `browse` for visual verification.

**Worktree:** `agentic-dealflow-restyle`, branch `feat/app-restyle` (from `bidsmith/main`).
**Brand source of truth:** `~/projects/bidsmith-brand/` (`mark.svg`, `brand-tokens.md`).

**Verification note:** Static-ish UI — "tests" mean **browser verification with gstack `browse`** plus `npm run build` (type-check) after foundation. Most pages are behind Supabase auth; Phase 0 sets up a dev login so authed pages can be screenshotted.

---

## Decisions locked here (confirm at plan review)

1. **Dark mode is removed.** The warm-paper identity is light-only. The `@media (prefers-color-scheme: dark)` block in `globals.css` goes away.
2. **Web teal → burgundy.** The hardcoded `#1F5E63` teal used as a brand accent in the Radar (`OpportunityList`/`OpportunityRow`) and bid-editor chrome becomes the burgundy accent on the web.
3. **PPTX style guide is NOT touched.** `DEFAULT_STYLE_GUIDE` in `src/app/bids/[id]/page.tsx` (teal `#1F5E63`, `Calibri`) drives the *generated PowerPoint*, a separate artifact. The bid-editor **slide-preview renderers** (`CoverRenderer`, `PhasesRenderer`, etc.) keep `styleGuide` colors so the preview matches the exported deck. Only the editor *chrome* (nav, buttons, panels, toasts) is restyled. (Rebranding the deck itself is a separate future effort.)
4. **Semantic colors keep their meaning.** `--urgency-*` / `--outcome-*` and the red/amber/green/blue alert palettes stay (they encode urgency / win-loss / go-no-go). Optional warm-tuning is noted but out of scope.

---

## Restyle Conventions (authoritative class mapping)

Every per-surface task below means: **apply this mapping** to the listed files, plus the page-specific notes. This is the complete instruction — no other interpretation needed.

| Old | New | Notes |
|-----|-----|-------|
| `bg-white` | `bg-paper` | page shells, cards |
| `bg-gray-50` | `bg-paper-2` | secondary surfaces, table headers |
| `bg-[#f8f8f7]`, `bg-[#fafafa]` | `bg-paper-2`, `bg-paper` | PipelineRail surfaces |
| `bg-gray-100` (chips/active) | `bg-paper-2` | competency chips, active nav item |
| `bg-gray-900`, `bg-black` (CTA) | `bg-ink` + `hover:bg-accent-ink` | all primary buttons, toast |
| `bg-gray-300` (disabled) | `bg-rule` | disabled button |
| `bg-[#1F5E63]` (teal brand) | `bg-accent` | radar tabs/buttons, score bubble high |
| `bg-[#E8E6DF]` (radar inactive) | `bg-paper-2` | radar inactive tab |
| `text-gray-900` | `text-ink` | primary text, headings |
| `text-gray-700`, `text-gray-600` | `text-ink-soft` | secondary prose, labels |
| `text-gray-500`, `text-gray-400` | `text-ink-mute` | subtitles, meta, placeholders, back links |
| `text-[#1F5E63]` | `text-accent-ink` | TED link, row hover |
| `border-gray-100`, `border-gray-200`, `border-gray-300` | `border-rule` | all hairlines, inputs, dividers |
| `border-l-2 border-gray-900` (callout) | `border-l-2 border-accent` | analysis summary callout |
| `focus:ring-gray-900`, `focus:ring-blue-200` | `focus:ring-accent-soft` | input/contenteditable focus |
| headings `font-bold`/`font-semibold` (h1/h2 page titles) | add `font-display font-normal` | Fraunces for display headings; keep `font-semibold` only for small inline labels |
| section labels `uppercase tracking-wider text-gray-500` | `font-mono ... text-ink-mute` | eyebrow/label style |
| `font-mono` (Geist Mono) | inherits `--font-mono` = JetBrains Mono automatically | no class change needed |

**Do NOT change:** semantic alert classes (`bg-red-50`, `text-green-700`, `bg-amber-50`, `bg-blue-50`, etc.), the `--urgency-*`/`--outcome-*` inline styles, the slide-preview renderer colors, or `DEFAULT_STYLE_GUIDE`.

Each task ends with: load the route in `browse`, screenshot at 1280px, confirm no `gray-*`/`bg-white` remnants in the changed files (`grep`), then commit.

---

### Task 0: Workspace + dev-login for verification

**Files:** none committed (local setup + one throwaway script).

- [ ] **Step 1: Install deps + env**
```bash
cp C:/Users/stefa/projects/agentic-dealflow/.env.local C:/Users/stefa/projects/agentic-dealflow-restyle/.env.local
cd C:/Users/stefa/projects/agentic-dealflow-restyle && npm install
```
- [ ] **Step 2: Start dev server (background)**
```bash
npm run dev   # http://localhost:3000
```
- [ ] **Step 3: Mint a dev session (bypass magic-link email)** — write `/tmp/dev-login.mjs` that uses `SUPABASE_SERVICE_ROLE_KEY` + `@supabase/supabase-js` `auth.admin.generateLink({ type: 'magiclink', email: <existing user> })`, print the `action_link`. Then in `browse`: `goto` the action_link → it sets the session cookie → redirected into the app. Confirm with `browse` that `/` no longer redirects to `/login`. (This is local-only verification tooling; do not commit it.)
- [ ] **Step 4:** Capture a "before" screenshot of `/login` and `/arbetsyta` for the before/after record.

> If dev-login is fiddly, fall back to screenshotting only public `/login` during build, and have Stefan spot-check authed pages.

---

### Task 1: Foundation — `globals.css` tokens

**Files:** Modify `src/app/globals.css` (replace entire contents).

- [ ] **Step 1: Replace `src/app/globals.css` with:**
```css
@import "tailwindcss";

:root {
  /* Bidsmith palette — Junto DNA, burgundy */
  --paper: #faf8f4;
  --paper-2: #f3efe7;
  --ink: #14120e;
  --ink-soft: #4a463e;
  --ink-mute: #8a847a;
  --rule: #e4dfd4;
  --accent: oklch(0.42 0.12 25);
  --accent-ink: oklch(0.32 0.1 25);
  --accent-soft: oklch(0.94 0.02 25);

  /* semantic — meaning preserved */
  --urgency-urgent: #dc2626;
  --urgency-soon: #d97706;
  --urgency-later: #10b981;
  --outcome-awaiting: #94a3b8;
  --outcome-won: #10b981;
  --outcome-lost: #dc2626;
  --outcome-cancelled: #94a3b8;
}

@theme inline {
  --color-paper: var(--paper);
  --color-paper-2: var(--paper-2);
  --color-ink: var(--ink);
  --color-ink-soft: var(--ink-soft);
  --color-ink-mute: var(--ink-mute);
  --color-rule: var(--rule);
  --color-accent: var(--accent);
  --color-accent-ink: var(--accent-ink);
  --color-accent-soft: var(--accent-soft);

  --font-display: var(--font-fraunces);
  --font-sans: var(--font-inter-tight);
  --font-mono: var(--font-jetbrains-mono);
}

body {
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-inter-tight), system-ui, sans-serif;
  font-feature-settings: "ss01", "cv11";
  -webkit-font-smoothing: antialiased;
}
```
- [ ] **Step 2:** Commit `feat(restyle): Bidsmith design tokens in globals.css, drop dark mode`.

---

### Task 2: Fonts — `layout.tsx`

**Files:** Modify `src/app/layout.tsx` (font imports + `<html>` className).

- [ ] **Step 1: Replace the Geist imports/instances** with:
```tsx
import { Fraunces, Inter_Tight, JetBrains_Mono } from "next/font/google";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT"],
  style: ["normal", "italic"],
});
const interTight = Inter_Tight({ variable: "--font-inter-tight", subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"] });
```
- [ ] **Step 2:** Update `<html>` className from the Geist variables to:
```tsx
className={`${fraunces.variable} ${interTight.variable} ${jetbrainsMono.variable} h-full antialiased`}
```
- [ ] **Step 3:** Run `npm run build` — expect type-check + font resolution to pass. If `axes: ["SOFT"]` errors, drop the `axes` line (variable wght still loads; opsz/SOFT fine-tuning is applied via `font-variation-settings` where needed).
- [ ] **Step 4:** Commit `feat(restyle): swap Geist for Fraunces/Inter Tight/JetBrains Mono`.

---

### Task 3: Shell — nav + body chrome in `layout.tsx`

**Files:** Modify `src/app/layout.tsx` (the `<nav>` block).

- [ ] **Step 1: Replace the `<nav>` block** with the Bidsmith topbar — inline anvil mark (from `~/projects/bidsmith-brand/mark.svg`) in burgundy + Fraunces wordmark + mono nav labels + burgundy active state:
```tsx
<nav className="border-b border-rule">
  <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-8">
    <Link href="/" className="flex items-center gap-2.5">
      <svg viewBox="0 0 200 200" aria-hidden className="w-7 h-7 text-accent">
        <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="100" cy="100" r="92" strokeWidth="2"/>
          <circle cx="100" cy="100" r="80" strokeWidth="1"/>
          <path d="M62 82 L120 82 L138 84 L152 91 L138 96 L120 98 L116 98 L116 104 L122 104 L118 118 L126 118 L132 132 L68 132 L74 118 L82 118 L78 104 L84 104 L84 90 L62 90 Z"/>
        </g>
      </svg>
      <span className="font-display text-xl tracking-tight">Bidsmith</span>
    </Link>
    <div className="flex items-center gap-6 font-mono text-xs uppercase tracking-wider text-ink-mute">
      <Link href="/" className="hover:text-ink">Analysera RFP</Link>
      <Link href="/arbetsyta" className="hover:text-ink">Arbetsyta</Link>
      <Link href="/radar" className="hover:text-ink">Radar</Link>
    </div>
  </div>
</nav>
```
- [ ] **Step 2:** Browser-verify nav at `/` (or `/login` if not authed). Commit `feat(restyle): Bidsmith topbar with anvil mark`.

---

### Task 4: PipelineRail + rows

**Files:** `src/components/pipeline/PipelineRail.tsx`, `PipelineRow.tsx`, `SubmittedRow.tsx`, `OutcomeSheet.tsx`, `OutcomeEnrichmentForm.tsx`.

- [ ] **Step 1:** Apply Restyle Conventions across all five files. Specifics: rail `bg-[#f8f8f7] border-l border-gray-200` → `bg-paper-2 border-l border-rule`; rows `bg-[#fafafa]` → `bg-paper`, `hover:bg-gray-100` → `hover:bg-paper-2`; section headings `text-gray-600` → `text-ink-mute` (keep `font-mono uppercase`); OutcomeSheet panel `bg-white` → `bg-paper`, backdrop `bg-black/20` keep; keep all `--urgency-*`/`--outcome-*` inline border styles unchanged.
- [ ] **Step 2:** Browser-verify the rail on an authed page. Commit `feat(restyle): pipeline rail + outcome sheet`.

---

### Task 5: `/login`

**Files:** `src/app/login/page.tsx`.

- [ ] **Step 1:** Apply Conventions. Specifics: `min-h-screen bg-white` → `min-h-screen bg-paper`; `h1` `text-2xl font-bold` → `text-3xl font-display font-normal`; input `border-gray-300 focus:ring-gray-900` → `border-rule focus:ring-accent-soft`; button `bg-gray-900 hover:bg-gray-800` → `bg-ink hover:bg-accent-ink`; keep green/red banners. Add the anvil mark above the heading (optional, burgundy, 40px).
- [ ] **Step 2:** Browser-verify `/login` (public). Commit `feat(restyle): login page`.

---

### Task 6: `/` home + `/analysis/[id]` (RFP analysis flow)

**Files:** `src/app/page.tsx`, `src/components/upload-form.tsx`, `src/app/analysis/[id]/page.tsx`, `src/components/analysis-result.tsx`, `src/components/analysis-match-section.tsx`, `src/components/go-no-go-result.tsx`, `src/components/team-proposal.tsx`.

- [ ] **Step 1:** Apply Conventions across these files. Specifics: page shells `bg-white`→`bg-paper`; `h1 text-3xl font-bold`→`font-display font-normal`; upload dropzone `border-dashed border-gray-300`→`border-dashed border-rule`; CTA `bg-gray-900`→`bg-ink hover:bg-accent-ink`; analysis section labels `text-gray-500`→`text-ink-mute` (keep `font-mono` feel — add `font-mono` where they're uppercase labels); summary callout `border-gray-900`→`border-accent`; **keep** priority badges (red/amber/emerald) and Go/No-Go semantic colors.
- [ ] **Step 2:** Browser-verify `/` and an `/analysis/[id]`. Commit `feat(restyle): RFP analysis flow`.

---

### Task 7: `/radar`

**Files:** `src/app/radar/page.tsx`, `src/components/radar/OpportunityList.tsx`, `src/components/radar/OpportunityRow.tsx`.

- [ ] **Step 1:** Apply Conventions. Specifics (teal → burgundy): tab active `bg-[#1F5E63] text-white`→`bg-accent text-paper`, inactive `bg-[#E8E6DF] text-gray-700`→`bg-paper-2 text-ink-soft`; action button `bg-[#1F5E63]`→`bg-accent`; TED link + hover `text-[#1F5E63]`→`text-accent-ink`; score bubble `scoreColor()` hexes (`#1F5E63`/`#8FAF9A`/`#ccc`) → burgundy ramp (`oklch(0.42 0.12 25)` / `oklch(0.6 0.07 30)` / `var(--rule)`) in that file's color fn; list wrapper `border-gray-200`→`border-rule`.
- [ ] **Step 2:** Browser-verify `/radar`. Commit `feat(restyle): radar`.

---

### Task 8: `/consultants` (+ `[id]`)

**Files:** `src/app/consultants/page.tsx`, `src/app/consultants/[id]/page.tsx`, `src/components/consultant-list.tsx`, `src/components/consultant-profile.tsx`, `src/components/consultant-upload.tsx`, `src/components/consultant-upload-wrapper.tsx`.

- [ ] **Step 1:** Apply Conventions. Specifics: table wrapper/`thead`/dividers `gray-*`→`rule`/`paper-2`; level badges keep semantic colors; competency chips `bg-gray-100 text-gray-600`→`bg-paper-2 text-ink-soft`; profile edit inputs `border-gray-300 focus:border-gray-900`→`border-rule focus:border-accent`; save button `bg-gray-900`→`bg-ink`; back link `text-gray-400`→`text-ink-mute`; section headings `text-lg font-semibold`→`font-display font-normal text-lg`.
- [ ] **Step 2:** Browser-verify `/consultants` and a profile. Commit `feat(restyle): consultants`.

---

### Task 9: `/arbetsyta` (+ `/arbetsyta/statistik`)

**Files:** `src/app/arbetsyta/page.tsx`, `src/app/arbetsyta/statistik/page.tsx`.

- [ ] **Step 1:** Apply Conventions. Specifics: nav cards `border-gray-200 hover:border-gray-400`→`border-rule hover:border-accent`; card `h2 text-lg font-semibold`→`font-display font-normal text-lg`; statistik period tabs active `bg-gray-900 text-white`→`bg-ink text-paper`, inactive `text-gray-500 hover:text-gray-900`→`text-ink-mute hover:text-ink`; table `thead border-gray-200 text-gray-500`→`border-rule text-ink-mute`, rows `border-gray-100`→`border-rule`; empty state `text-gray-400`→`text-ink-mute`.
- [ ] **Step 2:** Browser-verify both. Commit `feat(restyle): arbetsyta hub + statistik`.

---

### Task 10: `/bids/[id]` — bid editor chrome (NOT slide previews)

**Files:** `src/components/bid-editor/BidEditor.tsx`, `SectionNav.tsx`, `StructureEvalBadge.tsx`, `OverflowChecklist.tsx`, `EditableText.tsx`. **Do NOT touch** `renderers/*` (they mirror the PPTX via `styleGuide`).

- [ ] **Step 1:** Apply Conventions to the chrome only. Specifics: left aside `border-gray-200`→`border-rule`; center `bg-gray-50`→`bg-paper-2`; section label `text-gray-400`→`text-ink-mute font-mono`; SectionNav active `bg-gray-100`→`bg-paper-2`, hover `hover:bg-gray-50`→`hover:bg-paper-2`; saving toast `bg-gray-900`→`bg-ink`; export button `bg-gray-900`→`bg-ink hover:bg-accent-ink`; `EditableText` focus `focus:ring-blue-200`→`focus:ring-accent-soft`; **keep** StructureEvalBadge + OverflowChecklist semantic green/amber and all renderer colors.
- [ ] **Step 2:** Browser-verify `/bids/[id]` — confirm the slide previews still render in teal (deck-matching) while the chrome is burgundy/paper. Commit `feat(restyle): bid editor chrome`.

---

### Task 11: Sweep + build

**Files:** any stragglers.

- [ ] **Step 1:** `grep -rn "gray-[0-9]\|bg-white\|#1F5E63\|#E8E6DF\|#f8f8f7\|#fafafa" src` — review each remaining hit; convert chrome hits per Conventions, leave intentional ones (renderer/PPTX) with a brief `// PPTX deck color` comment where non-obvious.
- [ ] **Step 2:** `npm run build` — type-check + lint pass.
- [ ] **Step 3:** Full-app browser sweep: screenshot every route at 1280px + 390px, confirm cohesive paper/burgundy/Fraunces look, no stray gray, no horizontal scroll. Commit `chore(restyle): sweep stray colors + final build`.

---

## Self-Review

**Spec coverage:** Foundation (tokens+fonts+body) → Tasks 1–2. Shell (nav, rail) → Tasks 3–4. All 9 routes → Tasks 5–10. Decisions (dark-mode removal, teal→burgundy, PPTX untouched, semantics kept) → encoded in Conventions + Task 10 guardrail. Sweep/build → Task 11.

**Placeholder scan:** The per-surface tasks reference the authoritative Conventions table for the bulk mapping plus explicit page-specific class swaps drawn from the code inventory — concrete, not vague. Foundation/shell tasks contain exact code.

**Consistency:** Token names (`paper`, `paper-2`, `ink`, `ink-soft`, `ink-mute`, `rule`, `accent`, `accent-ink`, `accent-soft`) and font tokens (`--font-fraunces`/`--font-inter-tight`/`--font-jetbrains-mono` → `font-display`/`font-sans`/`font-mono`) are used identically across globals, layout, and every task.

**Open decision for Stefan:** confirm the 4 locked decisions (esp. teal→burgundy on web while the bid preview + PPTX stay teal). Also: keep semantic alert colors as-is, or warm-tune them later?
