"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ForgeLoader } from "./ForgeLoader";

export function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Analysis failed");
      }

      const data = await response.json();
      router.push(`/analysis/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="py-16 flex justify-center">
        <ForgeLoader size={72} />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="border-2 border-dashed border-rule rounded-lg p-8 text-center">
        <input
          type="file"
          accept=".pdf,.docx,.doc,.md,.txt"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="hidden"
          id="file-upload"
        />
        <label
          htmlFor="file-upload"
          className="cursor-pointer text-ink-soft hover:text-ink"
        >
          {file ? (
            <span className="text-lg font-medium">{file.name}</span>
          ) : (
            <div>
              <p className="text-lg font-medium">
                Ladda upp ett förfrågningsunderlag
              </p>
              <p className="text-sm text-ink-mute mt-1">
                PDF, Word, Markdown eller textfil
              </p>
            </div>
          )}
        </label>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!file || loading}
        className="w-full bg-ink text-white py-3 px-6 rounded-lg font-medium
                   hover:bg-accent-ink disabled:bg-rule disabled:cursor-not-allowed
                   transition-colors"
      >
        {loading ? "Analyserar..." : "Analysera"}
      </button>
    </form>
  );
}
