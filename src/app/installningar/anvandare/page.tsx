"use client";

import { useEffect, useState, useCallback } from "react";

interface AppUserView {
  id: string;
  email: string;
  role: "admin" | "member";
  status: "invited" | "active";
}

export default function UsersPage() {
  const [users, setUsers] = useState<AppUserView[]>([]);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (!res.ok) return;
    const body = (await res.json()) as { users: AppUserView[] };
    setUsers(body.users);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount, same pattern as OnboardingWizard's refresh
    void load();
  }, [load]);

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email) return;
    setStatus("sending");
    setErrorMessage(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setStatus("error");
      setErrorMessage(body.error ?? "Kunde inte bjuda in.");
      return;
    }
    setEmail("");
    setStatus("idle");
    await load();
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-display font-normal mb-6">Användare</h1>

      <form onSubmit={invite} className="flex gap-2 mb-8">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded-md border border-rule px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-soft"
          placeholder="kollega@foretag.se"
          disabled={status === "sending"}
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-accent-ink disabled:opacity-50"
        >
          {status === "sending" ? "Bjuder in…" : "Bjud in"}
        </button>
      </form>

      {errorMessage && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 mb-4">
          {errorMessage}
        </div>
      )}

      <ul className="divide-y divide-rule">
        {users.map((u) => (
          <li key={u.id} className="flex items-center justify-between py-3 text-sm">
            <span>{u.email}</span>
            <span className="text-ink-mute">
              {u.role === "admin" ? "Administratör" : "Medlem"} ·{" "}
              {u.status === "invited" ? "Inbjuden" : "Aktiv"}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
