"use client";

import { useTransition, useState } from "react";
import { removeMemberAction } from "@/app/team/actions";

type Props = {
  userId: string;
  email: string;
  role: "super_user" | "user";
  isSelf: boolean;
};

export function MemberRow({ userId, email, role, isSelf }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRemove() {
    if (!confirm(`Ta bort ${email} från organisationen?`)) return;
    startTransition(async () => {
      const res = await removeMemberAction(userId);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <li className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <div className="min-w-0">
        <div className="text-sm truncate">{email}</div>
        <div className="text-xs text-gray-500">
          {role === "super_user" ? "Super_user" : "User"}
          {isSelf && " · du"}
        </div>
      </div>
      {!isSelf && (
        <button
          onClick={handleRemove}
          disabled={pending}
          className="text-xs text-red-700 hover:underline disabled:opacity-40"
        >
          {pending ? "Tar bort…" : "Ta bort"}
        </button>
      )}
      {error && <span className="text-xs text-red-700 ml-2">{error}</span>}
    </li>
  );
}
