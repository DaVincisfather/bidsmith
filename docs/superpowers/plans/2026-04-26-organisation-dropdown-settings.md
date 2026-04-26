# Organisation Dropdown + Tenant-overlay Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dropdown nav under "Din organisation" with hierarchical sub-routes, plus a `/organisation/settings` page where super_users brand the tenant (display name, logo, accent color) — Junto-DNA stays untouched outside three explicit overlay surfaces.

**Architecture:** Three-PR sequence on the existing Next.js 16 App Router:
1. **PR 1:** Pure UI — dropdown component + banner header + third card (no DB changes).
2. **PR 2:** Migration 011 (`display_name`, `logo_url`, `accent_color` on `organizations`) + new Supabase Storage bucket `org-assets` with RLS + `/organisation/settings` route with name+logo form (accent UI disabled).
3. **PR 3:** Activate accent UI with curated swatches, hex input, and an HTML/CSS live-preview mock-up. PPTX rendering with tenant accent is **out of scope** (separate later spec).

**Tech Stack:** Next.js 16 (App Router), TypeScript strict, Tailwind v4, Supabase (Postgres + Storage + RLS), Vitest, server actions with `requireSuperUser()` pattern from `src/app/team/actions.ts`.

**Read first:** `AGENTS.md` flags Next.js 16 has breaking changes vs older training data. Before writing routing/server-action code, verify against `node_modules/next/dist/docs/` if anything looks unfamiliar.

---

## File Structure

**New files:**
- `src/components/organisation/OrgDropdown.tsx` — client component, hover/click trigger + menu
- `src/components/organisation/OrgBanner.tsx` — server component, logo + name + subtitle row
- `src/components/organisation/SettingsForm.tsx` — client component, form + drag-drop logo zone + swatch grid
- `src/components/organisation/AccentSwatches.tsx` — client component, presets + hex input + live-preview mock-up
- `src/app/organisation/settings/page.tsx` — server-rendered route, super_user only
- `src/app/organisation/settings/actions.ts` — server actions: `updateOrgName`, `uploadLogo`, `updateAccent`
- `src/lib/organisations.ts` — `getOrganization()`, `ACCENT_PRESETS`, `DEFAULT_ACCENT`
- `src/lib/__tests__/organisations.test.ts` — unit tests for helpers
- `src/app/organisation/settings/__tests__/actions.test.ts` — unit tests for server actions
- `supabase/migrations/011_organisation_branding.sql` — schema + Storage bucket + RLS

**Modified files:**
- `src/app/layout.tsx` — replace `Din organisation` link with `<OrgDropdown>`
- `src/app/organisation/page.tsx` — add `<OrgBanner>`, third "Inställningar" card

**Branches:**
- PR 1 lives on existing `feat/organisation-dropdown-settings`
- PR 2 lives on a fresh `feat/organisation-settings-form` (off master after PR 1 merges)
- PR 3 lives on a fresh `feat/organisation-accent` (off master after PR 2 merges)

---

# PHASE 1 — PR 1: Dropdown + banner

**Branch:** `feat/organisation-dropdown-settings` (already exists, off master, no commits ahead apart from spec).

**Verification:** Manual smoke test in browser. No DB changes.

---

## Task 1: Build `<OrgDropdown>` client component

**Files:**
- Create: `src/components/organisation/OrgDropdown.tsx`

**Why:** The trigger replaces the static `Din organisation` link in the top-nav. Hover OR click opens; click outside closes; parent itself does not navigate.

- [ ] **Step 1: Create the component file**

Write `src/components/organisation/OrgDropdown.tsx` with this exact content:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Item = {
  href: string;
  label: string;
  hidden?: boolean;
};

export function OrgDropdown({ isSuperUser }: { isSuperUser: boolean }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const items: Item[] = [
    { href: "/organisation", label: "Översikt" },
    { href: "/consultants", label: "Konsulter" },
    { href: "/team", label: "Team", hidden: !isSuperUser },
    { href: "/organisation/settings", label: "Inställningar", hidden: !isSuperUser },
  ];
  const visible = items.filter((i) => !i.hidden);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1"
      >
        Din organisation
        <span aria-hidden className="text-xs">▾</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1 min-w-[180px] bg-white border border-gray-200 rounded-md shadow-md py-1 z-50"
        >
          {visible.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors related to this file.

- [ ] **Step 3: Commit**

```bash
git add src/components/organisation/OrgDropdown.tsx
git commit -m "feat(nav): add OrgDropdown component with hover+click trigger"
```

---

## Task 2: Mount `<OrgDropdown>` in top-nav

**Files:**
- Modify: `src/app/layout.tsx` (replace lines 50-55 — the `Din organisation` `<Link>`)

**Why:** Top-nav renders on every page. We need to know `isSuperUser` server-side and pass it down. The existing layout is a Server Component.

- [ ] **Step 1: Add imports + super_user check at the top of `RootLayout`**

Open `src/app/layout.tsx`. Add these imports near the existing ones:

```tsx
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, NotAuthenticatedError, NoOrganizationError } from "@/lib/org";
import { OrgDropdown } from "@/components/organisation/OrgDropdown";
```

Convert the function to async and resolve `isSuperUser` (default `false` if unauthenticated, so the dropdown still renders sensibly on public pages):

```tsx
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  let isSuperUser = false;
  try {
    const supabase = await createClient();
    const { profile } = await getCurrentProfile(supabase);
    isSuperUser = profile.role === "super_user";
  } catch (err) {
    if (
      !(err instanceof NotAuthenticatedError) &&
      !(err instanceof NoOrganizationError)
    ) {
      throw err;
    }
  }
  // ... rest of the function
```

- [ ] **Step 2: Replace the `Din organisation` link with the dropdown**

In the `<nav>` block (currently lines 33-57 with `Analysera RFP`, `Radar`, `Din organisation`), replace the `Din organisation` `<Link>` (the third one) with:

```tsx
<OrgDropdown isSuperUser={isSuperUser} />
```

- [ ] **Step 3: Run dev server and verify in browser**

Run: `npm run dev`
Open `http://localhost:3000`. Verify:
- Top-nav shows `Din organisation ▾`
- Hover opens dropdown with: Översikt, Konsulter, Team (if super_user), Inställningar (if super_user)
- Click outside closes it
- Clicking `Översikt` navigates to `/organisation`
- Clicking `Konsulter` navigates to `/consultants`
- Login as a `user` role (not super_user) and verify Team + Inställningar are hidden

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(nav): replace Din organisation link with OrgDropdown"
```

---

## Task 3: Banner + third card on `/organisation`

**Files:**
- Create: `src/components/organisation/OrgBanner.tsx`
- Modify: `src/app/organisation/page.tsx` (header block + cards array)

**Why:** Banner introduces the tenant-overlay model on `/organisation`. Adds the `Inställningar`-card for super_users. PR 2 will wire it up to real data; for now the banner uses `organizations.name` and an initials badge (no `logo_url` exists yet in the schema).

- [ ] **Step 1: Create the banner component**

Write `src/components/organisation/OrgBanner.tsx`:

```tsx
type Props = {
  displayName: string;
  logoUrl?: string | null;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function OrgBanner({ displayName, logoUrl }: Props) {
  return (
    <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={`${displayName} logo`}
          className="w-7 h-7 object-contain rounded"
        />
      ) : (
        <div className="w-7 h-7 rounded bg-gray-100 flex items-center justify-center text-[10px] font-semibold text-gray-600">
          {initials(displayName) || "—"}
        </div>
      )}
      <div className="text-sm font-semibold text-gray-900">{displayName}</div>
      <div className="text-xs text-gray-500">Din organisation</div>
    </div>
  );
}
```

- [ ] **Step 2: Wire up `OrganisationPage` to fetch the org row + render banner + 3rd card**

Open `src/app/organisation/page.tsx`. Apply these three diffs in order.

(a) Add imports near the existing ones:

```tsx
import { OrgBanner } from "@/components/organisation/OrgBanner";
```

(b) Inside the `Promise.all` add a fourth fetch — the organization row — so we can read `name` (later: `display_name`):

```tsx
const [consultantCountResult, seatUsed, seatLimit, orgRow] = await Promise.all([
  supabase
    .from("consultants")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", profile.organization_id),
  (async () => {
    if (profile.role !== "super_user") return null;
    const service = createServiceClient();
    return countActiveSuperUsers(service, profile.organization_id);
  })(),
  (async () => {
    if (profile.role !== "super_user") return null;
    const service = createServiceClient();
    return getOrgSeatLimit(service, profile.organization_id);
  })(),
  supabase
    .from("organizations")
    .select("name")
    .eq("id", profile.organization_id)
    .single<{ name: string }>(),
]);

const orgName = orgRow.data?.name ?? "Organisation";
```

(c) Add a third card to the `cards` array:

```tsx
{
  href: "/organisation/settings",
  title: "Inställningar",
  description: "Logo, accentfärg och organisationsnamn för PPTX-export.",
  hidden: profile.role !== "super_user",
},
```

(d) Replace the `<h1>Din organisation</h1>` header block with the banner. Keep the rest of the JSX unchanged. The header block is currently:

```tsx
<div>
  <h1 className="text-2xl font-bold">Din organisation</h1>
  <p className="text-sm text-gray-500 mt-1">
    Inställningar och data som delas av hela teamet.
  </p>
</div>
```

Change it to:

```tsx
<OrgBanner displayName={orgName} />
```

- [ ] **Step 3: Verify in browser**

Run: `npm run dev`
Open `http://localhost:3000/organisation`. Verify:
- Banner row shows initials badge + org name + "Din organisation" subtitle (no full-page hero)
- Three cards as super_user: Konsulter, Team, Inställningar
- Two cards as `user` role: Konsulter only (Team + Inställningar hidden)
- Clicking the Inställningar card navigates to `/organisation/settings` (404 expected — route ships in PR 2)

- [ ] **Step 4: Run tests + lint**

Run: `npm test`
Expected: same baseline as master (~285 passing, 6 pre-existing failures unrelated to this PR).

Run: `npm run lint`
Expected: same baseline as master (any new lint errors are bugs to fix).

- [ ] **Step 5: Commit + push + open PR**

```bash
git add src/components/organisation/OrgBanner.tsx src/app/organisation/page.tsx
git commit -m "feat(organisation): banner header + Inställningar card"
git push -u origin feat/organisation-dropdown-settings
gh pr create --title "feat(nav): organisation dropdown + banner + Inställningar card" --body "$(cat <<'EOF'
## Summary
- Replace static \`Din organisation\` link with a dropdown (Översikt / Konsulter / Team / Inställningar)
- Add tenant-overlay banner on \`/organisation\` (initials badge + name)
- Add third card "Inställningar" linking to \`/organisation/settings\` (route ships in next PR)

No DB changes. Spec: \`docs/superpowers/specs/2026-04-26-organisation-dropdown-settings-design.md\`.

## Test plan
- [ ] Hover \`Din organisation\` opens dropdown
- [ ] Click outside closes dropdown
- [ ] As super_user: Team + Inställningar visible in dropdown and on /organisation
- [ ] As user: Team + Inställningar hidden
- [ ] /organisation banner renders with initials when no logo
- [ ] /organisation/settings link 404s (expected — comes in PR 2)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Wait for the PR-review routine to comment, then ask Stefan whether to merge.

---

# PHASE 2 — PR 2: /settings — display name + logo

**Branch:** `feat/organisation-settings-form` (NEW, off master, after PR 1 merges).

**DB changes:** Migration 011 adds `display_name`, `logo_url`, `accent_color` columns + creates `org-assets` Storage bucket + RLS.

---

## Task 4: Migration 011 — schema + Storage bucket + RLS

**Files:**
- Create: `supabase/migrations/011_organisation_branding.sql`

**Why:** Adds three columns to `organizations` (all NULLABLE except `accent_color` which has a default), creates the public `org-assets` bucket, and locks down writes to super_users via Storage RLS.

- [ ] **Step 1: Create the migration file**

Write `supabase/migrations/011_organisation_branding.sql` with this exact content:

```sql
-- M4: Tenant-overlay branding fields on organizations + org-assets storage bucket.
-- display_name and logo_url are NULLABLE; UI falls back to organizations.name + initials.
-- accent_color defaults to neutral slate; will be revised once Junto has its own palette.

-- 1. Branding columns
ALTER TABLE organizations
  ADD COLUMN display_name text,
  ADD COLUMN logo_url text,
  ADD COLUMN accent_color text NOT NULL DEFAULT '#1F2937';

-- 2. Storage bucket for tenant logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('org-assets', 'org-assets', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage RLS
-- Path convention: <org_id>/logo-<timestamp>.<ext>
-- Members READ; super_users WRITE/DELETE.

CREATE POLICY org_assets_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'org-assets'
    AND (split_part(name, '/', 1))::uuid = current_org_id()
  );

CREATE POLICY org_assets_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'org-assets'
    AND (split_part(name, '/', 1))::uuid = current_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
        AND organization_id = current_org_id()
        AND role = 'super_user'
    )
  );

CREATE POLICY org_assets_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'org-assets'
    AND (split_part(name, '/', 1))::uuid = current_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
        AND organization_id = current_org_id()
        AND role = 'super_user'
    )
  );

CREATE POLICY org_assets_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'org-assets'
    AND (split_part(name, '/', 1))::uuid = current_org_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
        AND organization_id = current_org_id()
        AND role = 'super_user'
    )
  );
```

- [ ] **Step 2: Apply migration manually via Supabase SQL editor**

Per the project's migration convention (`CLAUDE.md`: "applicera manuellt via Supabase SQL Editor"):

1. Open Supabase Dashboard → SQL Editor
2. Paste the entire content of `011_organisation_branding.sql`
3. Run
4. Verify in Table Editor: `organizations` has the 3 new columns, `accent_color` populated with `#1F2937` on the existing seed row
5. Verify in Storage: bucket `org-assets` exists, public

- [ ] **Step 3: Commit**

```bash
git checkout master
git pull
git checkout -b feat/organisation-settings-form
git add supabase/migrations/011_organisation_branding.sql
git commit -m "feat(db): migration 011 — branding columns + org-assets bucket"
```

---

## Task 5: `lib/organisations.ts` — helpers + tests

**Files:**
- Create: `src/lib/organisations.ts`
- Create: `src/lib/__tests__/organisations.test.ts`

**Why:** Centralise organization fetch + accent palette constants. Keeps `org.ts` (auth helpers) separate from branding helpers.

- [ ] **Step 1: Write the failing test**

Write `src/lib/__tests__/organisations.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrganization, ACCENT_PRESETS, DEFAULT_ACCENT, isValidHex } from "../organisations";

describe("ACCENT_PRESETS", () => {
  it("contains five entries with hex + label", () => {
    expect(ACCENT_PRESETS).toHaveLength(5);
    for (const p of ACCENT_PRESETS) {
      expect(p.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(p.label.length).toBeGreaterThan(0);
    }
  });

  it("uses neutral slate as the default-matching swatch", () => {
    expect(ACCENT_PRESETS[0].hex).toBe(DEFAULT_ACCENT);
    expect(DEFAULT_ACCENT).toBe("#1F2937");
  });
});

describe("isValidHex", () => {
  it("accepts 6-char hex with leading #", () => {
    expect(isValidHex("#1F2937")).toBe(true);
    expect(isValidHex("#abcdef")).toBe(true);
  });

  it("rejects shorter, longer, or non-hex strings", () => {
    expect(isValidHex("1F2937")).toBe(false);
    expect(isValidHex("#FFF")).toBe(false);
    expect(isValidHex("#1F29377")).toBe(false);
    expect(isValidHex("#GG2937")).toBe(false);
    expect(isValidHex("")).toBe(false);
  });
});

describe("getOrganization", () => {
  it("returns the org row keyed on id", async () => {
    const single = vi
      .fn()
      .mockResolvedValue({
        data: {
          id: "org-1",
          name: "Acme",
          display_name: "Acme AB",
          logo_url: null,
          accent_color: "#1F2937",
        },
        error: null,
      });
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ single })),
        })),
      })),
    } as unknown as SupabaseClient;

    const org = await getOrganization(supabase, "org-1");
    expect(org.id).toBe("org-1");
    expect(org.display_name).toBe("Acme AB");
    expect(org.accent_color).toBe("#1F2937");
  });

  it("throws when supabase returns an error", async () => {
    const single = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "boom" } });
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ single })),
        })),
      })),
    } as unknown as SupabaseClient;

    await expect(getOrganization(supabase, "org-1")).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- src/lib/__tests__/organisations.test.ts`
Expected: fail — module `../organisations` does not exist.

- [ ] **Step 3: Implement `lib/organisations.ts`**

Write `src/lib/organisations.ts`:

```ts
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
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test -- src/lib/__tests__/organisations.test.ts`
Expected: all pass (5+ tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/organisations.ts src/lib/__tests__/organisations.test.ts
git commit -m "feat(lib): organisations helpers + accent palette + hex validator"
```

---

## Task 6: Server actions — `updateOrgName` + `uploadLogo`

**Files:**
- Create: `src/app/organisation/settings/actions.ts`
- Create: `src/app/organisation/settings/__tests__/actions.test.ts`

**Why:** Mirrors the `src/app/team/actions.ts` pattern: `requireSuperUser()`, `ActionResult` return type, `revalidatePath` on success. Validation (length on name, hex on accent) lives here. `updateAccent` ships in PR 3 — add a stub now that returns an error so the form-level wiring can be added in this PR but stays disabled.

- [ ] **Step 1: Write the failing test**

Write `src/app/organisation/settings/__tests__/actions.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { validateOrgName, validateLogoFile } from "../actions";

describe("validateOrgName", () => {
  it("accepts 1-64 chars trimmed", () => {
    expect(validateOrgName("Acme")).toEqual({ ok: true, value: "Acme" });
    expect(validateOrgName("  Acme  ")).toEqual({ ok: true, value: "Acme" });
  });

  it("rejects empty after trim", () => {
    const r = validateOrgName("   ");
    expect(r.ok).toBe(false);
  });

  it("rejects > 64 chars", () => {
    const r = validateOrgName("a".repeat(65));
    expect(r.ok).toBe(false);
  });
});

describe("validateLogoFile", () => {
  it("accepts PNG/SVG/JPEG under 2 MB", () => {
    expect(validateLogoFile({ size: 1024, type: "image/png" }).ok).toBe(true);
    expect(validateLogoFile({ size: 1024, type: "image/svg+xml" }).ok).toBe(true);
    expect(validateLogoFile({ size: 1024, type: "image/jpeg" }).ok).toBe(true);
  });

  it("rejects files over 2 MB", () => {
    const r = validateLogoFile({ size: 3 * 1024 * 1024, type: "image/png" });
    expect(r.ok).toBe(false);
  });

  it("rejects unsupported MIME types", () => {
    expect(validateLogoFile({ size: 100, type: "image/gif" }).ok).toBe(false);
    expect(validateLogoFile({ size: 100, type: "application/pdf" }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- src/app/organisation/settings/__tests__/actions.test.ts`
Expected: fail — module does not exist.

- [ ] **Step 3: Implement `src/app/organisation/settings/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase";
import { getCurrentProfile } from "@/lib/org";

export type ActionResult = { ok: true } | { ok: false; error: string };

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_MIMES = new Set(["image/png", "image/svg+xml", "image/jpeg"]);

async function requireSuperUser() {
  const supabase = await createClient();
  const { userId, profile } = await getCurrentProfile(supabase);
  if (profile.role !== "super_user") {
    throw new Error("Only super_users can change organisation settings");
  }
  return { userId, organizationId: profile.organization_id };
}

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

export async function updateOrgNameAction(formData: FormData): Promise<ActionResult> {
  try {
    const raw = String(formData.get("display_name") ?? "");
    const v = validateOrgName(raw);
    if (!v.ok) return v;

    const { organizationId } = await requireSuperUser();
    const service = createServiceClient();
    const { error } = await service
      .from("organizations")
      .update({ display_name: v.value })
      .eq("id", organizationId);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/organisation");
    revalidatePath("/organisation/settings");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Okänt fel" };
  }
}

export async function uploadLogoAction(formData: FormData): Promise<ActionResult> {
  try {
    const file = formData.get("logo");
    if (!(file instanceof File)) {
      return { ok: false, error: "Ingen fil uppladdad" };
    }
    const v = validateLogoFile({ size: file.size, type: file.type });
    if (!v.ok) return v;

    const { organizationId } = await requireSuperUser();
    const service = createServiceClient();

    const ext = file.type === "image/svg+xml" ? "svg"
      : file.type === "image/jpeg" ? "jpg" : "png";
    const path = `${organizationId}/logo-${Date.now()}.${ext}`;

    const buffer = await file.arrayBuffer();
    const { error: uploadErr } = await service.storage
      .from("org-assets")
      .upload(path, buffer, { contentType: file.type, upsert: false });
    if (uploadErr) return { ok: false, error: uploadErr.message };

    const { data: pub } = service.storage.from("org-assets").getPublicUrl(path);
    const publicUrl = pub.publicUrl;

    const { error: updErr } = await service
      .from("organizations")
      .update({ logo_url: publicUrl })
      .eq("id", organizationId);
    if (updErr) return { ok: false, error: updErr.message };

    // Cleanup: keep only latest 2 logos for this org.
    const { data: list } = await service.storage
      .from("org-assets")
      .list(organizationId, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
    if (list && list.length > 2) {
      const toDelete = list.slice(2).map((o) => `${organizationId}/${o.name}`);
      await service.storage.from("org-assets").remove(toDelete);
    }

    revalidatePath("/organisation");
    revalidatePath("/organisation/settings");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Okänt fel" };
  }
}

// Stub — accent activation lands in PR 3.
export async function updateAccentAction(_formData: FormData): Promise<ActionResult> {
  return { ok: false, error: "Accentfärg är inte aktiverad ännu" };
}
```

- [ ] **Step 4: Run test, verify pure helpers pass**

Run: `npm test -- src/app/organisation/settings/__tests__/actions.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/organisation/settings/actions.ts src/app/organisation/settings/__tests__/actions.test.ts
git commit -m "feat(settings): updateOrgName + uploadLogo server actions"
```

---

## Task 7: `/organisation/settings` route + `<SettingsForm>`

**Files:**
- Create: `src/app/organisation/settings/page.tsx`
- Create: `src/components/organisation/SettingsForm.tsx`

**Why:** Server-rendered page does the auth/role guard and fetches the organization row; the client form handles user interactions. Accent UI is rendered in **disabled** state (`<button disabled>`) — wiring lands in PR 3.

- [ ] **Step 1: Create the page**

Write `src/app/organisation/settings/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase";
import { getCurrentProfile } from "@/lib/org";
import { getOrganization } from "@/lib/organisations";
import { SettingsForm } from "@/components/organisation/SettingsForm";

export const dynamic = "force-dynamic";

export default async function OrgSettingsPage() {
  const supabase = await createClient();
  const { profile } = await getCurrentProfile(supabase);
  if (profile.role !== "super_user") redirect("/organisation");

  const service = createServiceClient();
  const org = await getOrganization(service, profile.organization_id);

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-12 space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Inställningar</h1>
          <p className="text-sm text-gray-500 mt-1">
            Brand och organisationsidentitet.
          </p>
        </div>
        <SettingsForm
          initial={{
            displayName: org.display_name ?? org.name,
            logoUrl: org.logo_url,
            accentColor: org.accent_color,
          }}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Create the form component**

Write `src/components/organisation/SettingsForm.tsx`:

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import {
  updateOrgNameAction,
  uploadLogoAction,
} from "@/app/organisation/settings/actions";

type Initial = {
  displayName: string;
  logoUrl: string | null;
  accentColor: string;
};

export function SettingsForm({ initial }: { initial: Initial }) {
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleNameSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateOrgNameAction(formData);
      setMessage(res.ok ? { type: "ok", text: "Namn uppdaterat" } : { type: "error", text: res.error });
    });
  }

  function handleFile(file: File | null) {
    if (!file) return;
    const formData = new FormData();
    formData.append("logo", file);
    startTransition(async () => {
      const res = await uploadLogoAction(formData);
      if (res.ok) {
        setMessage({ type: "ok", text: "Logo uppdaterad" });
        // Force reload to get new logo_url from server-rendered page
        window.location.reload();
      } else {
        setMessage({ type: "error", text: res.error });
      }
    });
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0] ?? null;
    handleFile(file);
  }

  return (
    <div className="space-y-6">
      {/* Display name */}
      <form onSubmit={handleNameSubmit} className="border border-gray-200 rounded-lg p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Organisationens namn</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Visas i banner och PPTX-export. Lämna tomt för att falla tillbaka till basnamnet.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            name="display_name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={64}
            className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
            disabled={pending}
          />
          <button
            type="submit"
            disabled={pending}
            className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-40"
          >
            Spara
          </button>
        </div>
      </form>

      {/* Logo */}
      <div className="border border-gray-200 rounded-lg p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Logotyp</h2>
          <p className="text-xs text-gray-500 mt-0.5">PNG, SVG eller JPEG, max 2 MB.</p>
        </div>
        <div className="flex gap-4 items-stretch">
          <div className="w-24 h-24 border border-gray-200 rounded bg-white flex items-center justify-center">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
            ) : (
              <span className="text-xs text-gray-400">Ingen logo</span>
            )}
          </div>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={
              "flex-1 border-2 border-dashed rounded p-4 flex flex-col items-center justify-center cursor-pointer text-center " +
              (dragOver ? "border-blue-400 bg-blue-50" : "border-gray-300")
            }
            onClick={() => fileInputRef.current?.click()}
          >
            <p className="text-xs text-gray-600">Dra och släpp filen här</p>
            <p className="text-xs text-gray-400 mt-1">eller klicka för att bläddra</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/svg+xml,image/jpeg"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              disabled={pending}
            />
          </div>
        </div>
      </div>

      {/* Accent (disabled — activated in PR 3) */}
      <div className="border border-gray-200 rounded-lg p-4 space-y-3 opacity-50">
        <div>
          <h2 className="text-sm font-semibold">Accentfärg (PPTX)</h2>
          <p className="text-xs text-gray-500 mt-0.5">Aktiveras i nästa version.</p>
        </div>
        <div className="flex gap-2">
          <div
            className="w-8 h-8 rounded border border-gray-300"
            style={{ background: initial.accentColor }}
          />
          <code className="text-xs text-gray-500 self-center">{initial.accentColor}</code>
        </div>
      </div>

      {message && (
        <p className={"text-sm " + (message.type === "ok" ? "text-green-700" : "text-red-700")}>
          {message.text}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify in browser**

Run: `npm run dev`
Open `http://localhost:3000/organisation/settings`. Verify:
- As super_user: page renders with name input, logo zone, disabled accent block
- As user: redirects to `/organisation`
- Update name and submit → success message + name updated
- Drag-drop a PNG → upload + page reload + logo visible in zone preview
- Try uploading a 3 MB file → error message
- Try uploading a GIF → error message

- [ ] **Step 4: Commit**

```bash
git add src/app/organisation/settings/page.tsx src/components/organisation/SettingsForm.tsx
git commit -m "feat(settings): /organisation/settings route with name + logo form"
```

---

## Task 8: Wire `<OrgBanner>` to `logo_url` + `display_name`

**Files:**
- Modify: `src/app/organisation/page.tsx` (the `Promise.all` query)

**Why:** PR 1 only fetched `name` because the columns didn't exist. Now they do — read all three branding fields and pass them to `<OrgBanner>`.

- [ ] **Step 1: Update the Promise.all query**

In `src/app/organisation/page.tsx`, find the org-row fetch:

```tsx
supabase
  .from("organizations")
  .select("name")
  .eq("id", profile.organization_id)
  .single<{ name: string }>(),
```

Replace with:

```tsx
supabase
  .from("organizations")
  .select("name, display_name, logo_url")
  .eq("id", profile.organization_id)
  .single<{ name: string; display_name: string | null; logo_url: string | null }>(),
```

- [ ] **Step 2: Compute orgName + logoUrl from the fetched row**

Replace:

```tsx
const orgName = orgRow.data?.name ?? "Organisation";
```

With:

```tsx
const orgName = orgRow.data?.display_name ?? orgRow.data?.name ?? "Organisation";
const logoUrl = orgRow.data?.logo_url ?? null;
```

- [ ] **Step 3: Pass `logoUrl` to `<OrgBanner>`**

Find the `<OrgBanner>` JSX and update it:

```tsx
<OrgBanner displayName={orgName} logoUrl={logoUrl} />
```

- [ ] **Step 4: Verify in browser**

Run: `npm run dev`
Open `http://localhost:3000/organisation`. Verify:
- If you uploaded a logo in Task 7, the banner now shows it (not the initials badge)
- If no logo, initials badge still shows
- If you set a display_name, banner shows that instead of `name`

- [ ] **Step 5: Run tests + lint + commit + PR**

Run: `npm test`
Expected: same baseline + new tests from Task 5+6 passing.

Run: `npm run lint`
Expected: clean for new files.

```bash
git add src/app/organisation/page.tsx
git commit -m "feat(organisation): banner reads display_name + logo_url"
git push -u origin feat/organisation-settings-form
gh pr create --title "feat(settings): /organisation/settings — name + logo" --body "$(cat <<'EOF'
## Summary
- Migration 011: \`display_name\`, \`logo_url\`, \`accent_color\` on \`organizations\` + \`org-assets\` Storage bucket with role-based RLS
- New route \`/organisation/settings\` (super_user only) for name + logo
- \`<OrgBanner>\` now reads \`display_name\` + \`logo_url\` (with name fallback)
- Accent UI rendered but disabled (lands in PR 3)

Spec: \`docs/superpowers/specs/2026-04-26-organisation-dropdown-settings-design.md\`.

## Test plan
- [ ] Migration 011 applied via Supabase SQL editor on dev
- [ ] As super_user: edit display_name, see banner update
- [ ] As super_user: drag-drop PNG/SVG/JPEG, see logo in banner
- [ ] As super_user: try 3 MB file → error
- [ ] As super_user: try GIF → error
- [ ] As user: /organisation/settings redirects to /organisation
- [ ] As user via Storage API: cannot INSERT into org-assets (RLS blocks)
- [ ] Vitest passes (organisations + actions test files)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# PHASE 3 — PR 3: Accent activation

**Branch:** `feat/organisation-accent` (NEW, off master, after PR 2 merges).

**No DB changes** — Migration 011 already added the column.

---

## Task 9: Activate `updateAccentAction`

**Files:**
- Modify: `src/app/organisation/settings/actions.ts` (replace stub)
- Modify: `src/app/organisation/settings/__tests__/actions.test.ts` (add hex tests via `validateAccent`)

**Why:** The PR 2 stub returns an error. Replace it with a real implementation that validates hex via `isValidHex` and writes to `accent_color`.

- [ ] **Step 1: Add failing test for accent validation**

Append to `src/app/organisation/settings/__tests__/actions.test.ts`:

```ts
import { validateAccent } from "../actions";

describe("validateAccent", () => {
  it("accepts a 6-char hex with leading #", () => {
    expect(validateAccent("#1F2937")).toEqual({ ok: true, value: "#1f2937" });
  });

  it("normalises uppercase hex to lowercase", () => {
    expect(validateAccent("#ABCDEF")).toEqual({ ok: true, value: "#abcdef" });
  });

  it("rejects invalid hex", () => {
    expect(validateAccent("1F2937").ok).toBe(false);
    expect(validateAccent("#FFF").ok).toBe(false);
    expect(validateAccent("").ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- src/app/organisation/settings/__tests__/actions.test.ts`
Expected: fail — `validateAccent` does not exist.

- [ ] **Step 3: Replace the `updateAccentAction` stub**

In `src/app/organisation/settings/actions.ts`, add a new import at the top:

```ts
import { isValidHex } from "@/lib/organisations";
```

Add this validator above `updateOrgNameAction`:

```ts
export function validateAccent(
  raw: string
): { ok: true; value: string } | { ok: false; error: string } {
  if (!isValidHex(raw)) {
    return { ok: false, error: "Ogiltig hex-färg (förväntat format: #RRGGBB)" };
  }
  return { ok: true, value: raw.toLowerCase() };
}
```

Replace the stub `updateAccentAction` with:

```ts
export async function updateAccentAction(formData: FormData): Promise<ActionResult> {
  try {
    const raw = String(formData.get("accent_color") ?? "");
    const v = validateAccent(raw);
    if (!v.ok) return v;

    const { organizationId } = await requireSuperUser();
    const service = createServiceClient();
    const { error } = await service
      .from("organizations")
      .update({ accent_color: v.value })
      .eq("id", organizationId);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/organisation");
    revalidatePath("/organisation/settings");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Okänt fel" };
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npm test -- src/app/organisation/settings/__tests__/actions.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git checkout master
git pull
git checkout -b feat/organisation-accent
git add src/app/organisation/settings/actions.ts src/app/organisation/settings/__tests__/actions.test.ts
git commit -m "feat(settings): activate updateAccent server action"
```

---

## Task 10: `<AccentSwatches>` + live-preview mock-up

**Files:**
- Create: `src/components/organisation/AccentSwatches.tsx`
- Modify: `src/components/organisation/SettingsForm.tsx` (replace disabled accent block)

**Why:** Curated palette + hex input + a small HTML/CSS mock-up that shows a vertical accent stripe next to a fake slide title. This is **NOT** a real PPTX render — it's a UI illustration.

- [ ] **Step 1: Create `<AccentSwatches>`**

Write `src/components/organisation/AccentSwatches.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { ACCENT_PRESETS, isValidHex } from "@/lib/organisations";
import { updateAccentAction } from "@/app/organisation/settings/actions";

export function AccentSwatches({ initialAccent }: { initialAccent: string }) {
  const [accent, setAccent] = useState(initialAccent);
  const [hexInput, setHexInput] = useState(initialAccent);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  function handleSwatchClick(hex: string) {
    setAccent(hex);
    setHexInput(hex);
  }

  function handleHexChange(value: string) {
    setHexInput(value);
    if (isValidHex(value)) setAccent(value.toLowerCase());
  }

  function handleSave() {
    if (!isValidHex(hexInput)) {
      setMessage({ type: "error", text: "Ogiltig hex-färg" });
      return;
    }
    const formData = new FormData();
    formData.append("accent_color", hexInput);
    startTransition(async () => {
      const res = await updateAccentAction(formData);
      setMessage(res.ok ? { type: "ok", text: "Accent sparad" } : { type: "error", text: res.error });
    });
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Accentfärg (PPTX)</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Färgen används som accent i exporterade PPTX-anbud. Välj en preset eller klistra in hex.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {ACCENT_PRESETS.map((p) => (
          <button
            type="button"
            key={p.hex}
            aria-label={p.label}
            onClick={() => handleSwatchClick(p.hex)}
            className={
              "w-8 h-8 rounded border-2 transition " +
              (accent.toLowerCase() === p.hex.toLowerCase()
                ? "border-gray-900"
                : "border-gray-200 hover:border-gray-400")
            }
            style={{ background: p.hex }}
          />
        ))}
        <input
          type="text"
          value={hexInput}
          onChange={(e) => handleHexChange(e.target.value)}
          maxLength={7}
          spellCheck={false}
          className="font-mono text-xs border border-gray-300 rounded px-2 py-1 w-24"
          placeholder="#1F2937"
        />
      </div>

      {/* Live preview — HTML/CSS mock-up of how accent looks on a PPTX-style title slide.
          NOT a real PPTX render. */}
      <div className="border border-gray-200 rounded p-3 bg-white">
        <div className="text-xs text-gray-500 mb-2">Förhandsvisning på PPTX-slide:</div>
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 rounded-sm" style={{ background: accent }} />
          <div className="text-sm font-semibold text-gray-900">Anbud till offentlig kund</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-40"
        >
          Spara accent
        </button>
        {message && (
          <span className={"text-xs " + (message.type === "ok" ? "text-green-700" : "text-red-700")}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace the disabled accent block in `SettingsForm.tsx`**

In `src/components/organisation/SettingsForm.tsx`:

(a) Add the import at the top:

```tsx
import { AccentSwatches } from "@/components/organisation/AccentSwatches";
```

(b) Replace the entire `{/* Accent (disabled — activated in PR 3) */}` block (the `<div className="border border-gray-200 rounded-lg p-4 space-y-3 opacity-50">...</div>`) with:

```tsx
<AccentSwatches initialAccent={initial.accentColor} />
```

- [ ] **Step 3: Verify in browser**

Run: `npm run dev`
Open `http://localhost:3000/organisation/settings`. Verify:
- Five swatches render with the default one outlined
- Clicking a swatch updates the live-preview stripe color
- Typing a valid hex (e.g. `#ff00aa`) updates the preview live
- Typing an invalid hex (e.g. `#fff`) does NOT crash, just doesn't update the preview
- Click "Spara accent" → success message
- Reload page → swatch outline matches saved color (was #1F2937 by default; now whatever you chose)

- [ ] **Step 4: Run tests + lint**

Run: `npm test`
Expected: all baseline + new tests pass.

Run: `npm run lint`
Expected: clean for new files.

- [ ] **Step 5: Commit + push + PR**

```bash
git add src/components/organisation/AccentSwatches.tsx src/components/organisation/SettingsForm.tsx
git commit -m "feat(settings): activate accent swatches with live preview"
git push -u origin feat/organisation-accent
gh pr create --title "feat(settings): activate accent color picker" --body "$(cat <<'EOF'
## Summary
- Replace disabled accent block in SettingsForm with \`<AccentSwatches>\`
- Five curated presets (Slate, Navy, Sage, Oxblood, Gold) + free hex input
- HTML/CSS live-preview mock-up — NOT a real PPTX render (separate later spec)
- \`updateAccent\` server action goes live (validates hex, writes \`accent_color\`)

No DB changes. Spec: \`docs/superpowers/specs/2026-04-26-organisation-dropdown-settings-design.md\`.

## Test plan
- [ ] Click swatch updates preview stripe
- [ ] Hex input updates preview live for valid hex
- [ ] Invalid hex does not crash
- [ ] Save persists; reload shows saved swatch outlined
- [ ] As user: form not reachable (still redirect from /organisation/settings)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# Done

After PR 3 merges:
- Three columns live on `organizations`
- One Storage bucket for tenant logos with super_user-only writes
- Dropdown nav in top-nav, banner on `/organisation`, full settings page with name + logo + accent
- PPTX render with tenant accent is the next separate spec (out of scope here)

**Memory follow-up (already noted in `project_junto_rebrand.md`):** revisit the default accent and curated palette once Junto has its own brand colors.
