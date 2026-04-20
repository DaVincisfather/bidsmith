"use client";

import { useState, useTransition } from "react";
import { createInviteAction } from "@/app/team/actions";

export function InviteForm({ seatInfo }: { seatInfo: { used: number; limit: number } }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"super_user" | "user">("super_user");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const disabled =
    role === "super_user" && seatInfo.used >= seatInfo.limit ? true : false;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createInviteAction(formData);
      if (res.ok) {
        setMessage({ type: "ok", text: `Inbjudan skickad till ${email}` });
        setEmail("");
      } else {
        setMessage({ type: "error", text: res.error });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="border border-gray-200 rounded-lg p-4 space-y-3">
      <h2 className="text-sm font-semibold">Bjud in medlem</h2>
      <div className="text-xs text-gray-500">
        Super_users: {seatInfo.used}/{seatInfo.limit}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          name="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="kollega@firma.se"
          className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
          disabled={pending}
        />
        <select
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value as "super_user" | "user")}
          className="border border-gray-300 rounded px-3 py-2 text-sm"
          disabled={pending}
        >
          <option value="super_user">Super_user</option>
          <option value="user">User</option>
        </select>
        <button
          type="submit"
          disabled={pending || disabled}
          className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-40"
        >
          {pending ? "Skickar…" : "Skicka inbjudan"}
        </button>
      </div>
      {disabled && (
        <p className="text-xs text-amber-700">
          Super_user-taket nått. Ta bort någon först, eller bjud in som user.
        </p>
      )}
      {message && (
        <p
          className={
            "text-xs " + (message.type === "ok" ? "text-green-700" : "text-red-700")
          }
        >
          {message.text}
        </p>
      )}
    </form>
  );
}
