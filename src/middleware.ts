import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Cron routes authenticate via CRON_SECRET header, not Supabase session.
const PUBLIC_PATHS = [
  "/login",
  "/setup",
  "/api/setup",
  "/auth/callback",
  "/auth/signout",
  "/api/radar/fetch",
  "/api/radar/score",
];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const pathname = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    // Fail CLOSED (audit 2026-08-17): utan env-nycklarna kan ingen session
    // verifieras. Den gamla öppna vägen gjorde HELA appen anonymt läsbar när en
    // self-hostare bara satt service-nyckeln — arbetsyta-sidorna läser med
    // service-klienten (RLS-bypass) och middlewaren var enda vakten. Publika
    // paths släpps igenom så /login och /setup kan rendera sina felmeddelanden.
    if (isPublic) return response;
    const msg =
      "Servern är felkonfigurerad: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY saknas. Se SETUP.md.";
    return pathname.startsWith("/api/")
      ? NextResponse.json({ error: msg }, { status: 503 })
      : new NextResponse(msg, { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }: { name: string; value: string }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options: CookieOptions }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home);
  }

  return response;
}

export const config = {
  matcher: [
    // Skip static assets and Next.js internals — men BARA verkliga assets:
    // rotfiler (t.ex. /file.svg) och /templates/*. Det gamla mönstret
    // `.*\.(?:png|...)$` undantog VARJE path med bildändelse, så dynamiska
    // routes som /consultants/x.png nådde handlern helt utan auth
    // (audit 2026-08-17) — ofarligt idag enbart för att alla id:n är strikta
    // UUID:er, men auth-gränsen ska bäras av design, inte koincidens.
    "/((?!_next/static|_next/image|favicon.ico|[^/]+\\.(?:svg|png|jpg|jpeg|gif|webp)$|templates/[^/]+\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
