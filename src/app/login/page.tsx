"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { messageForOtpError } from "./otp-error";

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email) return;

    setStatus("sending");
    setErrorMessage(null);

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      next
    )}`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
    });

    if (error) {
      setStatus("error");
      setErrorMessage(messageForOtpError(error.message));
      return;
    }

    setStatus("sent");
  }

  return (
    <main className="min-h-screen bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <svg viewBox="0 0 200 200" aria-hidden className="w-10 h-10 text-accent mb-5">
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="100" cy="100" r="92" strokeWidth="2" />
            <circle cx="100" cy="100" r="80" strokeWidth="1" />
            <path d="M62 82 L120 82 L138 84 L152 91 L138 96 L120 98 L116 98 L116 104 L122 104 L118 118 L126 118 L132 132 L68 132 L74 118 L82 118 L78 104 L84 104 L84 90 L62 90 Z" />
          </g>
        </svg>
        <h1 className="text-3xl font-display font-normal mb-2">Logga in</h1>
        <p className="text-sm text-ink-mute mb-8">
          Ange din e-postadress så skickar vi en inloggningslänk.
        </p>

        {status === "sent" ? (
          <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            Vi har skickat en inloggningslänk till <strong>{email}</strong>.
            Öppna mejlet och klicka på länken för att logga in.
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
              {status === "sending" ? "Skickar…" : "Skicka inloggningslänk"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
