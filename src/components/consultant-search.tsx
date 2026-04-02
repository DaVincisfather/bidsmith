"use client";

import { useState, useRef, useEffect } from "react";

interface ScoredConsultant {
  consultantId: string;
  consultantName: string;
  level: string;
  score: number;
  reasoning: string;
}

interface ConsultantSearchProps {
  options: ScoredConsultant[];
  selected: ScoredConsultant;
  onSelect: (consultant: ScoredConsultant) => void;
}

export function ConsultantSearch({ options, selected, onSelect }: ConsultantSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sort by score descending
  const sorted = [...options].sort((a, b) => b.score - a.score);

  const filtered = query
    ? sorted.filter((c) =>
        c.consultantName.toLowerCase().includes(query.toLowerCase())
      )
    : sorted;

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(consultant: ScoredConsultant) {
    onSelect(consultant);
    setOpen(false);
    setQuery("");
  }

  function scoreColor(score: number): string {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-blue-600";
    if (score >= 40) return "text-yellow-600";
    return "text-gray-400";
  }

  return (
    <div ref={ref} className="relative">
      {open ? (
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Sök konsult..."
          autoFocus
          className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:border-gray-900"
        />
      ) : (
        <button
          onClick={() => {
            setOpen(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="text-sm border border-gray-200 rounded px-3 py-1.5 hover:bg-gray-50 flex items-center gap-2 w-full text-left"
        >
          <span className="truncate">{selected.consultantName}</span>
          <span className={`text-xs font-mono shrink-0 ${scoreColor(selected.score)}`}>
            {selected.score}
          </span>
        </button>
      )}

      {open && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">Inga träffar</div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.consultantId}
                onClick={() => handleSelect(c)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between ${
                  c.consultantId === selected.consultantId ? "bg-gray-50 font-medium" : ""
                }`}
              >
                <span className="truncate">{c.consultantName}</span>
                <span className={`text-xs font-mono shrink-0 ml-2 ${scoreColor(c.score)}`}>
                  {c.score}/100
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
