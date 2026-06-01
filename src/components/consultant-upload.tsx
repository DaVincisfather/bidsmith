"use client";

import { useState } from "react";

interface UploadResult {
  fileName: string;
  consultantId: string | null;
  error: string | null;
}

interface UploadResponse {
  total: number;
  successful: number;
  failed: number;
  results: UploadResult[];
}

interface ConsultantUploadProps {
  onComplete: () => void;
}

export function ConsultantUpload({ onComplete }: ConsultantUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) return;

    setLoading(true);
    setError(null);
    setProgress(null);

    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append("files", file);
      }

      const response = await fetch("/api/consultants/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Upload failed");
      }

      const data: UploadResponse = await response.json();
      setProgress(data);
      setFiles([]);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="border-2 border-dashed border-rule rounded-lg p-6 text-center">
          <input
            type="file"
            accept=".docx,.doc,.md,.txt"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
            className="hidden"
            id="cv-upload"
          />
          <label htmlFor="cv-upload" className="cursor-pointer text-ink-soft hover:text-ink">
            {files.length > 0 ? (
              <span className="font-medium">{files.length} fil(er) valda</span>
            ) : (
              <div>
                <p className="font-medium">Ladda upp CV:n</p>
                <p className="text-sm text-ink-mute mt-1">Word, Markdown eller textfil. Flera filer samtidigt.</p>
              </div>
            )}
          </label>
        </div>

        {files.length > 0 && (
          <ul className="text-sm text-ink-mute space-y-1">
            {files.map((f, i) => (
              <li key={i}>{f.name}</li>
            ))}
          </ul>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={files.length === 0 || loading}
          className="w-full bg-ink text-white py-2.5 px-6 rounded-lg font-medium
                     hover:bg-accent-ink disabled:bg-paper-2 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Extraherar profiler..." : `Ladda upp ${files.length > 0 ? `(${files.length})` : ""}`}
        </button>
      </form>

      {progress && (
        <div className="bg-paper-2 p-4 rounded-lg text-sm space-y-2">
          <p className="font-medium">
            {progress.successful} av {progress.total} lyckades
          </p>
          {progress.results.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className={r.error ? "text-red-500" : "text-green-500"}>
                {r.error ? "x" : "v"}
              </span>
              <span>{r.fileName}</span>
              {r.error && <span className="text-red-400 text-xs">({r.error})</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
