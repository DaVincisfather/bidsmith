"use client";

import { useTransition, useState } from "react";
import { cancelInviteAction, resendInviteAction } from "@/app/team/actions";

type Props = {
  id: string;
  email: string;
  role: "super_user" | "user";
  expiresAt: string;
};

export function InviteRow({ id, email, role, expiresAt }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const expired = new Date(expiresAt).getTime() < Date.now();

  function handleCancel() {
    if (!confirm(`Dra tillbaka inbjudan till ${email}?`)) return;
    startTransition(async () => {
      const res = await cancelInviteAction(id);
      if (!res.ok) setError(res.error);
    });
  }

  function handleResend() {
    startTransition(async () => {
      const res = await resendInviteAction(id);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <li className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <div className="min-w-0">
        <div className="text-sm truncate">{email}</div>
        <div className="text-xs text-gray-500">
          {role === "super_user" ? "Super_user" : "User"} ·{" "}
          {expired ? (
            <span className="text-red-700">Utgången</span>
          ) : (
            <>Går ut {new Date(expiresAt).toLocaleDateString("sv-SE")}</>
          )}
        </div>
      </div>
      <div className="flex gap-3 text-xs">
        <button
          onClick={handleResend}
          disabled={pending}
          className="text-blue-700 hover:underline disabled:opacity-40"
        >
          {pending ? "…" : "Skicka igen"}
        </button>
        <button
          onClick={handleCancel}
          disabled={pending}
          className="text-red-700 hover:underline disabled:opacity-40"
        >
          Dra tillbaka
        </button>
      </div>
      {error && <span className="text-xs text-red-700 ml-2">{error}</span>}
    </li>
  );
}
