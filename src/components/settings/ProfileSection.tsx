"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface ProfileRow {
  id: string;
  company_name: string;
  tonality: string | null;
  boilerplate: string | null;
}

interface ProfileSectionProps {
  profiles: ProfileRow[];
  activeProfileId: string | null;
  migration005Missing: boolean;
}

const MIGRATION_HINT =
  "Tabellen org_profiles saknas — applicera migration 005 (005_org_profiles.sql) via Supabase SQL Editor för att hantera avsändarprofiler.";

export function ProfileSection({
  profiles,
  activeProfileId,
  migration005Missing,
}: ProfileSectionProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [tonality, setTonality] = useState("");
  const [boilerplate, setBoilerplate] = useState("");
  const [saving, setSaving] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setEditingId(null);
    setCompanyName("");
    setTonality("");
    setBoilerplate("");
    // Avbryt/reset ska inte lämna kvar en gammal felbanner över det tomma formuläret.
    setError(null);
  }

  function startEdit(p: ProfileRow) {
    setEditingId(p.id);
    setCompanyName(p.company_name);
    setTonality(p.tonality ?? "");
    setBoilerplate(p.boilerplate ?? "");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyName.trim()) return;

    setSaving(true);
    setError(null);

    // camelCase-body — routern mappar till snake_case.
    const body = {
      companyName: companyName.trim(),
      tonality: tonality.trim() || null,
      boilerplate: boilerplate.trim() || null,
    };

    try {
      const response = await fetch(
        editingId ? `/api/profiles/${editingId}` : "/api/profiles",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "kunde inte spara profilen");
      }
      resetForm();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Något gick fel");
    } finally {
      setSaving(false);
    }
  }

  async function handleActivate(id: string) {
    // En aktivering i taget: activatingId delas mellan raderna, så utan denna
    // guard kan ett klick på rad B åter-aktivera rad A:s knapp och dubbel-submitta.
    if (activatingId !== null) return;
    setActivatingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/profiles/${id}/activate`, { method: "POST" });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "aktiveringen misslyckades");
      }
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
        <h2 className="text-lg font-display font-normal">Avsändarprofil</h2>
        <p className="mt-1 text-sm text-ink-mute">
          Bolagsfakta och röst som AI:n använder när anbud skrivs.
        </p>
      </div>

      {migration005Missing && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded text-sm">
          {MIGRATION_HINT}
        </div>
      )}

      {/* Lista */}
      {!migration005Missing && (
        profiles.length === 0 ? (
          <p className="text-ink-mute text-sm py-8 text-center">
            Inga profiler ännu. Skapa en nedan.
          </p>
        ) : (
          <div className="border border-rule rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-paper-2">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-ink-soft">Företag</th>
                  <th className="text-right px-4 py-2 font-medium text-ink-soft"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {profiles.map((p) => (
                  <tr key={p.id} className="hover:bg-paper-2">
                    <td className="px-4 py-3 font-medium text-ink">{p.company_name}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {p.id === activeProfileId ? (
                          <span className="text-xs font-medium px-2 py-1 rounded bg-accent-soft text-accent-ink">
                            Aktiv
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleActivate(p.id)}
                            disabled={activatingId === p.id}
                            className="text-xs font-medium px-3 py-1 rounded border border-rule
                                       hover:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {activatingId === p.id ? "Aktiverar..." : "Aktivera"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => startEdit(p)}
                          className="text-xs font-medium px-3 py-1 rounded border border-rule hover:border-accent"
                        >
                          Redigera
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Formulär */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <h3 className="text-base font-display font-normal">
          {editingId ? "Redigera profil" : "Ny profil"}
        </h3>

        <div>
          <label htmlFor="profile-company" className="block text-sm font-medium text-ink-soft mb-1">
            Företagsnamn
          </label>
          <input
            id="profile-company"
            type="text"
            required
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            disabled={migration005Missing}
            className="w-full border border-rule rounded px-3 py-1.5 text-sm
                       disabled:bg-paper-2 disabled:cursor-not-allowed"
          />
        </div>

        <div>
          <label htmlFor="profile-tonality" className="block text-sm font-medium text-ink-soft mb-1">
            Tonalitet
          </label>
          <textarea
            id="profile-tonality"
            rows={2}
            value={tonality}
            onChange={(e) => setTonality(e.target.value)}
            disabled={migration005Missing}
            className="w-full border border-rule rounded px-3 py-1.5 text-sm
                       disabled:bg-paper-2 disabled:cursor-not-allowed"
          />
          <p className="mt-1 text-xs text-ink-mute">
            Beskriv rösten — t.ex. &quot;Rak, konkret, inga superlativ&quot;
          </p>
        </div>

        <div>
          <label htmlFor="profile-boilerplate" className="block text-sm font-medium text-ink-soft mb-1">
            Boilerplate
          </label>
          <textarea
            id="profile-boilerplate"
            rows={4}
            value={boilerplate}
            onChange={(e) => setBoilerplate(e.target.value)}
            disabled={migration005Missing}
            className="w-full border border-rule rounded px-3 py-1.5 text-sm
                       disabled:bg-paper-2 disabled:cursor-not-allowed"
          />
          <p className="mt-1 text-xs text-ink-mute">
            Fakta om bolaget som AI:n får använda — den hittar inte på utöver detta.
          </p>
        </div>

        {migration005Missing && (
          <p className="text-xs text-ink-mute">
            Formuläret är inaktiverat tills migration 005 har applicerats.
          </p>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || migration005Missing || !companyName.trim()}
            className="bg-ink text-white py-2.5 px-6 rounded-lg font-medium
                       hover:bg-accent-ink disabled:bg-paper-2 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Sparar..." : editingId ? "Spara ändringar" : "Skapa profil"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              disabled={saving}
              className="text-sm font-medium px-4 py-2 rounded border border-rule hover:border-accent"
            >
              Avbryt
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
