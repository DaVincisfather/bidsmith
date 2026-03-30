"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
        <input
          type="file"
          accept=".pdf,.docx,.doc,.md,.txt"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="hidden"
          id="file-upload"
        />
        <label
          htmlFor="file-upload"
          className="cursor-pointer text-gray-600 hover:text-gray-900"
        >
          {file ? (
            <span className="text-lg font-medium">{file.name}</span>
          ) : (
            <div>
              <p className="text-lg font-medium">
                Ladda upp ett forfrågningsunderlag
              </p>
              <p className="text-sm text-gray-400 mt-1">
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
        className="w-full bg-gray-900 text-white py-3 px-6 rounded-lg font-medium
                   hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed
                   transition-colors"
      >
        {loading ? "Analyserar..." : "Analysera"}
      </button>
    </form>
  );
}
