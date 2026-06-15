"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TemplateRow } from "@/app/installningar/page";
import type { TemplateManifest } from "@/lib/pptx-template/manifest-types";

interface TemplateSectionProps {
  templates: TemplateRow[];
  activeTemplateId: string | null;
}

// Svaret från POST /api/templates — preview innan aktivering.
interface UploadResponse {
  id: string;
  name: string;
  version: number;
  manifest: TemplateManifest;
  warnings?: string[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE");
}

export function TemplateSection({ templates, activeTemplateId }: TemplateSectionProps) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<UploadResponse | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // tillåt återuppladdning av samma fil
    if (!file) return;

    setUploading(true);
    setError(null);
    setPreview(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/templates", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const data = await response.json();
        const base = data.error || "uppladdningen misslyckades";
        // 422 = konventionsfel i mallen — peka på författarguiden.
        const msg = response.status === 422 ? `${base} — se docs/template-authoring.md` : base;
        throw new Error(msg);
      }
      const data: UploadResponse = await response.json();
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Något gick fel");
    } finally {
      setUploading(false);
    }
  }

  async function handleActivate(id: string) {
    setActivatingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/templates/${id}/activate`, { method: "POST" });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "aktiveringen misslyckades");
      }
      setPreview(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Något gick fel");
    } finally {
      setActivatingId(null);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-display font-normal">Anbudsmall</h2>
        <p className="mt-1 text-sm text-ink-mute">
          Den aktiva mallen styr layouten på genererade anbud.
        </p>
      </div>

      {/* Lista */}
      {templates.length === 0 ? (
        <p className="text-ink-mute text-sm py-8 text-center">
          Inga mallar ännu.
        </p>
      ) : (
        <div className="border border-rule rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-paper-2">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-ink-soft">Namn</th>
                <th className="text-left px-4 py-2 font-medium text-ink-soft">Version</th>
                <th className="text-left px-4 py-2 font-medium text-ink-soft">Skapad</th>
                <th className="text-right px-4 py-2 font-medium text-ink-soft"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {templates.map((t) => (
                <tr key={t.id} className="hover:bg-paper-2">
                  <td className="px-4 py-3 font-medium text-ink">{t.name}</td>
                  <td className="px-4 py-3 text-ink-soft">v{t.version}</td>
                  <td className="px-4 py-3 text-ink-soft">{formatDate(t.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    {t.id === activeTemplateId ? (
                      <span className="text-xs font-medium px-2 py-1 rounded bg-accent-soft text-accent-ink">
                        Aktiv
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleActivate(t.id)}
                        disabled={activatingId === t.id}
                        className="text-xs font-medium px-3 py-1 rounded border border-rule
                                   hover:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {activatingId === t.id ? "Aktiverar..." : "Aktivera"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Uppladdning */}
      <div className="border-2 border-dashed border-rule rounded-lg p-6 text-center">
        <input
          type="file"
          accept=".pptx"
          onChange={handleUpload}
          disabled={uploading}
          className="hidden"
          id="template-upload"
        />
        <label
          htmlFor="template-upload"
          className={`cursor-pointer text-ink-soft hover:text-ink ${uploading ? "pointer-events-none opacity-50" : ""}`}
        >
          {uploading ? (
            <span className="font-medium">Introspekterar mall...</span>
          ) : (
            <div>
              <p className="font-medium">Ladda upp ny mall</p>
              <p className="text-sm text-ink-mute mt-1">.pptx — förhandsgranskas före aktivering.</p>
            </div>
          )}
        </label>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      {preview && <TemplatePreview preview={preview} onActivate={handleActivate} activating={activatingId === preview.id} />}
    </section>
  );
}

interface TemplatePreviewProps {
  preview: UploadResponse;
  onActivate: (id: string) => void;
  activating: boolean;
}

function TemplatePreview({ preview, onActivate, activating }: TemplatePreviewProps) {
  const { manifest, warnings } = preview;
  const budgetEntries = Object.entries(manifest.budgets);

  return (
    <div className="border border-rule rounded-lg p-5 space-y-5 bg-paper-2">
      <div>
        <h3 className="text-base font-display font-normal">
          Förhandsgranskning: {preview.name} v{preview.version}
        </h3>
        <p className="mt-1 text-sm text-ink-mute">
          Granska innan du aktiverar. Aktivering byter mall för nya anbud.
        </p>
      </div>

      {warnings && warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded text-sm space-y-1">
          {warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      {/* Slides */}
      <div>
        <h4 className="text-sm font-medium text-ink-soft mb-2">Slides ({manifest.slides.length})</h4>
        <div className="border border-rule rounded-lg overflow-hidden bg-paper">
          <table className="w-full text-sm">
            <thead className="bg-paper-2">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-ink-soft">Källa</th>
                <th className="text-left px-3 py-2 font-medium text-ink-soft">Typ</th>
                <th className="text-left px-3 py-2 font-medium text-ink-soft">Platshållare</th>
                <th className="text-left px-3 py-2 font-medium text-ink-soft">Bildytor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {manifest.slides.map((s) => (
                <tr key={s.source}>
                  <td className="px-3 py-2 text-ink-soft">#{s.source}</td>
                  <td className="px-3 py-2 text-ink">
                    {s.type}
                    {s.variant ? <span className="text-ink-mute"> · {s.variant}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-ink-soft">{s.placeholders.length}</td>
                  <td className="px-3 py-2 text-ink-soft">
                    {s.imageShapes
                      ? `${s.imageShapes.placed} bild(er), ${s.imageShapes.placeholders} ytor`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {manifest.slides.some((s) => s.imageShapes) && (
          <p className="mt-2 text-xs text-ink-mute">
            Bilder lämnas orörda — tomma bildytor fylls från er bildbank efter export.
          </p>
        )}
      </div>

      {/* Exkluderade slides */}
      {manifest.excludedSlides.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-ink-soft mb-2">
            Exkluderade slides ({manifest.excludedSlides.length})
          </h4>
          <ul className="text-sm text-ink-soft space-y-1">
            {manifest.excludedSlides.map((e) => (
              <li key={e.source}>
                <span className="text-ink-mute">#{e.source}</span> — {e.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Budgetar */}
      {budgetEntries.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-ink-soft mb-2">Teckenbudgetar</h4>
          <div className="border border-rule rounded-lg overflow-hidden bg-paper">
            <table className="w-full text-sm">
              <thead className="bg-paper-2">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-ink-soft">Fält</th>
                  <th className="text-right px-3 py-2 font-medium text-ink-soft">Tecken</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {budgetEntries.map(([field, max]) => (
                  <tr key={field}>
                    <td className="px-3 py-2 font-mono text-xs text-ink-soft">{field}</td>
                    <td className="px-3 py-2 text-right text-ink">{max}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => onActivate(preview.id)}
        disabled={activating}
        className="w-full bg-ink text-white py-2.5 px-6 rounded-lg font-medium
                   hover:bg-accent-ink disabled:bg-paper-2 disabled:cursor-not-allowed transition-colors"
      >
        {activating ? "Aktiverar..." : "Aktivera den här mallen"}
      </button>
    </div>
  );
}
