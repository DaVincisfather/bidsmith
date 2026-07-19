# Setting up Bidsmith

Get a running instance in about 10 minutes. You need three free accounts:
an [Anthropic API key](https://console.anthropic.com/), a
[Supabase](https://supabase.com/) project, and [Node.js 20+](https://nodejs.org/).

---

## 1. Clone and install

```bash
git clone <your-fork-url> bidsmith
cd bidsmith
npm install
```

## 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com/) → **New project**. Pick a name and a
   strong database password. The free tier is plenty for a demo.
2. Wait ~2 minutes for it to provision.

## 3. Create the database schema and storage buckets

**Fresh install (recommended):**

1. In your Supabase project, open **SQL Editor** (left sidebar) → **New query**.
2. Open `supabase/setup.sql`, copy its ENTIRE contents, paste, and click **Run** —
   once. It contains every migration in order **and creates the three private
   storage buckets** (`rfp-documents`, `consultant-cvs`, `bid-templates`), so
   there are no manual bucket steps.
3. Verify from the repo: `npm run doctor` — every line should be green.

**Existing install:** do NOT run `setup.sql`. Keep applying the files in
`supabase/migrations/` incrementally in numeric order, exactly as before.

> Running only `001_initial_schema.sql` is **not** enough — the template system and
> organisation profiles live in later migrations, and bid generation fails without them.

> Optional: to populate sample TED-radar competencies, run `supabase/seed.sql` too.

## 4. Verify with the doctor

```bash
npm run doctor
```

Checks env keys, Supabase reachability, that every migration sentinel is in place,
that all three buckets exist, and that the bundled template file is present. Each
failure prints the exact fix. (The buckets are private; the app reads and writes
via the service-role key and signed URLs.)

> Heads-up for the Supabase free tier: projects pause after ~7 days of inactivity
> (DNS stops resolving). Restore from the dashboard; allow ~5 minutes to boot.

## 5. Configure environment variables

```bash
cp .env.local.example .env.local
```

Open `.env.local` and fill in the values. Each one is explained in the file:

| Variable | Where to find it |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/) → API Keys |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → "Project URL" (looks like `https://<ref>.supabase.co` — not the dashboard URL) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` (secret) |
| `CRON_SECRET` | Required if you use the TED radar. The `/api/radar/fetch` and `/api/radar/score` endpoints reject **all** requests unless this is set and sent as `Authorization: Bearer <CRON_SECRET>`. Leave unset to keep the radar background jobs disabled (they will 401). |

Optional feature flags (sane defaults — set only to change behavior):

| Flag | Default | Effect |
|---|---|---|
| `BIDSMITH_FOREIGN_TEMPLATES` | on | Custom-template upload + onboarding wizard. Set `off` to hide the surface. Activation of an onboarded template is gated on the measurement pass (`npm run onboarding:measure`, requires Windows + PowerPoint) regardless of this flag. |
| `BIDSMITH_STRUCTURED_OUTPUTS` | on | Claude structured outputs for AI responses. Set `off` to fall back to freetext + JSON extraction. |

## 6. Enable email login in Supabase

Bidsmith logs people in with a magic link (no passwords).

1. Supabase → **Authentication** → **Providers** → make sure **Email** is enabled.
2. Supabase → **Authentication** → **URL Configuration** → add your site URL to
   **Redirect URLs**: `http://localhost:3000/**` (the `/**` wildcard lets the auth
   callback through). For a deployed demo, add that URL too.

> Tip: for a frictionless demo, you can turn **off** "Confirm email" under
> Authentication → Providers → Email, so the magic link logs in directly.

> Troubleshooting: if `npm run dev` starts on another port (e.g. 3001 because
> 3000 was busy), the magic link will be rejected until you add that URL to
> **Redirect URLs** too (`http://localhost:3001/**`).

## 7. Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), enter your email, and click the
magic link that arrives in your inbox. You're in.

> First time in, the workspace is empty. Go to **Konsulter** to upload consultant CVs,
> then **Analysera RFP** to upload a tender, and watch the pipeline work:
> requirement analysis → consultant matching → go/no-go → bid draft → PowerPoint export.

---

## Deploying a shared demo (optional)

To give colleagues a URL they can log into:

1. Push your repo to GitHub and import it into [Vercel](https://vercel.com/new).
2. Add the same environment variables in Vercel → Project → Settings → Environment
   Variables.
3. In Supabase → Authentication → URL Configuration, add the Vercel URL (with `/**`)
   to **Redirect URLs**.
4. Deploy. Anyone you invite can now log in with their email.

> **Note:** Bidsmith is a single shared workspace — every person who logs in sees and
> edits the same consultants, analyses, and bids. That's intended for a single team or
> company. There is no per-user data isolation.

---

## Troubleshooting

- **RFP upload fails with "Bucket not found":** you skipped step 4. Create the
  `rfp-documents` storage bucket.
- **Magic link goes to the wrong URL / "redirect not allowed":** the login URL isn't in
  Supabase → Authentication → URL Configuration → Redirect URLs. Add it with `/**`.
- **AI steps fail with an auth error:** `ANTHROPIC_API_KEY` is missing or invalid in
  `.env.local`. Restart `npm run dev` after editing env files.
- **`NEXT_PUBLIC_SUPABASE_URL` errors:** make sure it's the API URL
  (`https://<ref>.supabase.co`), not the dashboard URL
  (`https://supabase.com/dashboard/project/<ref>`).
- **PPTX export fails:** make sure step 3 ran fully — the `template_configs` rows at the
  end of the migration are required for export.
- **Tests:** `npm test`. A handful of tests make live API calls and will fail without a
  real `ANTHROPIC_API_KEY` in the environment — that's expected without keys.
```