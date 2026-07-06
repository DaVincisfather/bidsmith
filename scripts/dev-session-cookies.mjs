// Mints an authenticated Supabase session cookie header for headless API testing
// against a local dev server. Bypasses the magic-link email round-trip by using the
// service-role admin API to generate a login token directly, so scripts (smoke tests,
// demo seeding, screenshot recording) can call authenticated routes without a browser.
//
// Usage:
//   node scripts/dev-session-cookies.mjs [--email you@example.com]
//
// Prints a ready-to-use `Cookie:` header value on stdout. Reads Supabase credentials
// from .env.local in the current working directory. Creates the user if it does not
// exist (email confirmation pre-set — no email is ever sent).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

export function loadEnvLocal(path = ".env.local") {
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
}

/** Returns a `Cookie:` header string carrying a valid session for `email`. */
export async function mintSessionCookies(email) {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY in .env.local");
  }

  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Ensure the user exists; admin-created users skip the confirmation email.
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw listErr;
  if (!list.users.some((u) => u.email === email)) {
    const { error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
  }

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr) throw linkErr;

  // Verify the token through an @supabase/ssr client with an in-memory cookie jar,
  // so the resulting cookies have exactly the shape the app's middleware expects.
  const jar = new Map();
  const ssr = createServerClient(url, anon, {
    cookies: {
      getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  const { error: otpErr } = await ssr.auth.verifyOtp({
    type: link.properties.verification_type,
    token_hash: link.properties.hashed_token,
  });
  if (otpErr) throw otpErr;

  const header = [...jar.entries()].map(([n, v]) => `${n}=${v}`).join("; ");
  if (!header) throw new Error("verifyOtp succeeded but no session cookies were set");
  return header;
}

// CLI entry point.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const i = process.argv.indexOf("--email");
  const email = i !== -1 ? process.argv[i + 1] : "dev-smoke@bidsmith.local";
  mintSessionCookies(email).then(
    (header) => console.log(header),
    (err) => {
      console.error(err.message ?? err);
      process.exit(1);
    },
  );
}
