"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Competency {
  id: string;
  competency: string;
  category: string;
}

interface Reference {
  id: string;
  title: string;
  description: string;
  year: number;
  sector: string;
}

interface ConsultantData {
  id: string;
  name: string;
  level: string;
  years_experience: number | null;
  summary: string | null;
  consultant_competencies: Competency[];
  consultant_references: Reference[];
}

interface ConsultantProfileProps {
  consultant: ConsultantData;
}

const LEVEL_LABELS: Record<string, string> = {
  junior: "Junior",
  intermediate: "Medel",
  senior: "Senior",
  expert: "Expert",
};

const CATEGORY_LABELS: Record<string, string> = {
  technical: "Teknisk",
  domain: "Domän",
  methodology: "Metodik",
  certification: "Certifiering",
};

export function ConsultantProfile({ consultant }: ConsultantProfileProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(consultant.name);
  const [level, setLevel] = useState(consultant.level);
  const [summary, setSummary] = useState(consultant.summary || "");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function handleSave() {
    setSaving(true);
    try {
      const response = await fetch(`/api/consultants/${consultant.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          level,
          summary,
          yearsExperience: consultant.years_experience,
          competencies: consultant.consultant_competencies.map((c) => ({
            competency: c.competency,
            category: c.category,
          })),
          references: consultant.consultant_references.map((r) => ({
            title: r.title,
            description: r.description,
            year: r.year,
            sector: r.sector,
          })),
        }),
      });

      if (!response.ok) throw new Error("Save failed");

      setEditing(false);
      router.refresh();
    } catch {
      alert("Kunde inte spara. Försök igen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          {editing ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-2xl font-bold border-b border-gray-300 focus:outline-none focus:border-gray-900"
            />
          ) : (
            <h1 className="text-2xl font-bold">{consultant.name}</h1>
          )}
          <div className="flex items-center gap-3 mt-2">
            {editing ? (
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              >
                <option value="junior">Junior</option>
                <option value="intermediate">Medel</option>
                <option value="senior">Senior</option>
                <option value="expert">Expert</option>
              </select>
            ) : (
              <span className="text-sm text-gray-500">
                {LEVEL_LABELS[consultant.level] || consultant.level}
              </span>
            )}
            {consultant.years_experience && (
              <span className="text-sm text-gray-400">
                {consultant.years_experience} års erfarenhet
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-gray-900 text-white px-4 py-1.5 rounded text-sm hover:bg-gray-800 disabled:bg-gray-300"
              >
                {saving ? "Sparar..." : "Spara"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="border border-gray-300 px-4 py-1.5 rounded text-sm hover:bg-gray-50"
              >
                Avbryt
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="border border-gray-300 px-4 py-1.5 rounded text-sm hover:bg-gray-50"
            >
              Redigera
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Sammanfattning</h2>
        {editing ? (
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
            className="w-full border border-gray-300 rounded p-3 text-sm focus:outline-none focus:border-gray-900"
          />
        ) : (
          <p className="text-gray-700">{consultant.summary || "Ingen sammanfattning"}</p>
        )}
      </section>

      {/* Competencies */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Kompetenser</h2>
        <div className="flex flex-wrap gap-2">
          {consultant.consultant_competencies.map((c) => (
            <span
              key={c.id}
              className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm"
            >
              {c.competency}
              <span className="text-blue-400 ml-1 text-xs">
                ({CATEGORY_LABELS[c.category] || c.category})
              </span>
            </span>
          ))}
        </div>
      </section>

      {/* References */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Uppdrag</h2>
        <div className="space-y-3">
          {consultant.consultant_references.map((r) => (
            <div key={r.id} className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">{r.title}</span>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span>{r.year}</span>
                  <span className={r.sector === "public" ? "text-blue-500" : "text-gray-500"}>
                    {r.sector === "public" ? "Offentlig" : "Privat"}
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-600">{r.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
