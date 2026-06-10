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

## 3. Create the database schema

1. In your Supabase project, open **SQL Editor** (left sidebar) → **New query**.
2. Open `supabase/migrations/001_initial_schema.sql` from this repo, copy its entire
   contents, paste into the editor, and click **Run**.
3. You should see "Success. No rows returned." That's it — all tables, security
   policies, and the required template configs are now in place.

> Optional: to populate sample TED-radar competencies, repeat with `supabase/seed.sql`.

## 4. Create the storage bucket

Uploaded RFP documents are stored in a Supabase Storage bucket. Buckets can't be
created from SQL, so add it once via the dashboard:

1. Supabase → **Storage** (left sidebar) → **New bucket**.
2. Name it exactly **`rfp-documents`**.
3. Leave **Public bucket OFF** — it stays private; the app generates signed URLs on
   demand.
4. Click **Create**.

No bucket policies are needed: the app reads and writes via the service-role key.

> Skip this and RFP upload fails with "Bucket not found".

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