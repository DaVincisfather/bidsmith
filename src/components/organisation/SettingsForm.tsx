"use client";

import { useRef, useState, useTransition } from "react";
import {
  updateOrgNameAction,
  uploadLogoAction,
} from "@/app/organisation/settings/actions";
import { AccentSwatches } from "@/components/organisation/AccentSwatches";

type Initial = {
  displayName: string;
  logoUrl: string | null;
  accentColor: string;
};

export function SettingsForm({ initial }: { initial: Initial }) {
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleNameSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateOrgNameAction(formData);
      setMessage(res.ok ? { type: "ok", text: "Namn uppdaterat" } : { type: "error", text: res.error });
    });
  }

  function handleFile(file: File | null) {
    if (!file) return;
    const formData = new FormData();
    formData.append("logo", file);
    startTransition(async () => {
      const res = await uploadLogoAction(formData);
      if (res.ok) {
        setMessage({ type: "ok", text: "Logo uppdaterad" });
        // Force reload to get new logo_url from server-rendered page
        window.location.reload();
      } else {
        setMessage({ type: "error", text: res.error });
      }
    });
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0] ?? null;
    handleFile(file);
  }

  return (
    <div className="space-y-6">
      {/* Display name */}
      <form onSubmit={handleNameSubmit} className="border border-gray-200 rounded-lg p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Organisationens namn</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Visas i banner och PPTX-export.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            name="display_name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={64}
            className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
            disabled={pending}
          />
          <button
            type="submit"
            disabled={pending}
            className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-40"
          >
            Spara
          </button>
        </div>
      </form>

      {/* Logo */}
      <div className="border border-gray-200 rounded-lg p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Logotyp</h2>
          <p className="text-xs text-gray-500 mt-0.5">PNG, SVG eller JPEG, max 2 MB.</p>
        </div>
        <div className="flex gap-4 items-stretch">
          <div className="w-24 h-24 border border-gray-200 rounded bg-white flex items-center justify-center">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
            ) : (
              <span className="text-xs text-gray-400">Ingen logo</span>
            )}
          </div>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={
              "flex-1 border-2 border-dashed rounded p-4 flex flex-col items-center justify-center cursor-pointer text-center " +
              (dragOver ? "border-blue-400 bg-blue-50" : "border-gray-300")
            }
            onClick={() => fileInputRef.current?.click()}
          >
            <p className="text-xs text-gray-600">Dra och släpp filen här</p>
            <p className="text-xs text-gray-400 mt-1">eller klicka för att bläddra</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/svg+xml,image/jpeg"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              disabled={pending}
            />
          </div>
        </div>
      </div>

      <AccentSwatches initialAccent={initial.accentColor} />

      {message && (
        <p className={"text-sm " + (message.type === "ok" ? "text-green-700" : "text-red-700")}>
          {message.text}
        </p>
      )}
    </div>
  );
}
