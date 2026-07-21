"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "adopted" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/setup/status")
      .then((r) => r.json())
      .then((d: { needsSetup: boolean }) => {
        if (!active) return;
        if (!d.needsSetup) router.replace("/login");
        else setReady(true);
      })
      .catch(() => active && setReady(true));
    return () => {
      active = false;
    };
  }, [router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email) return;
    setStatus("sending");
    setErrorMessage(null);
    const res = await fetch("/api/setup/bootstrap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setStatus("error");
      setErrorMessage(body.error ?? "Kunde inte slutföra setup.");
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { adopted?: boolean };
    setStatus(body.adopted ? "adopted" : "sent");
  }

  if (!ready) return null;

  return (
    <main className="min-h-screen bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-display font-normal mb-2">Kom igång</h1>
        <p className="text-sm text-ink-mute mb-8">
          Ange din e-postadress för att skapa administratörskontot. Du får en
          inloggningslänk. Det här steget kan bara göras en gång.
        </p>

        {status === "adopted" ? (
          <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            <strong>{email}</strong> hade redan ett konto — det är nu
            administratör. Inget mejl har skickats:{" "}
            <a href="/login" className="underline">logga in via /login</a> som
            vanligt.
          </div>
        ) : status === "sent" ? (
          <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            Administratörskontot är skapat. Vi har skickat en inloggningslänk till{" "}
            <strong>{email}</strong>. Öppna mejlet och klicka på länken.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1">
                E-post
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-rule px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-soft"
                placeholder="du@foretag.se"
                disabled={status === "sending"}
              />
            </div>

            {errorMessage && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full rounded-md bg-ink py-2 text-sm font-medium text-white hover:bg-accent-ink disabled:opacity-50"
            >
              {status === "sending" ? "Skapar…" : "Skapa administratörskonto"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
