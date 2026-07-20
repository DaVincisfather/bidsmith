import Markitdown from "markitdown-js";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

export const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".doc", ".pptx", ".xlsx", ".md", ".txt"];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

/**
 * Coarse per-request byte ceiling for upload routes, checked from Content-Length
 * BEFORE the body is materialised (formData/arrayBuffer). It is a circuit-breaker
 * against memory exhaustion, not the precise per-file limit — validateDocument
 * still enforces MAX_FILE_SIZE on each file. Sized generously so a legitimate
 * batch of CVs or a single large RFP passes; only a pathological body is rejected.
 */
export const MAX_UPLOAD_REQUEST_BYTES = 100 * 1024 * 1024; // 100 MB

export function getExtension(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop();
  return ext ? `.${ext}` : "";
}

// MIME types keyed by our WHITELISTED extensions. Derive the stored
// content-type from the (validated) extension, never from the client's
// file.type — a spoofed text/html on an allowed extension would make Supabase
// serve an uploaded file as HTML (stored-XSS on the storage origin).
const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".md": "text/markdown",
  ".txt": "text/plain",
};

/** Safe storage content-type for a validated upload; octet-stream fallback. */
export function contentTypeForFile(fileName: string): string {
  return CONTENT_TYPES[getExtension(fileName)] ?? "application/octet-stream";
}

/**
 * Validates size and extension. Exported so callers can reject a bad upload
 * BEFORE persisting it (e.g. to Storage) instead of discovering the problem
 * only when parseDocument runs after the write. Throws on violation.
 */
export function validateDocument(buffer: Buffer, fileName: string): void {
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File too large (${Math.round(buffer.length / 1024 / 1024)}MB). Max ${MAX_FILE_SIZE / 1024 / 1024}MB.`);
  }

  const ext = getExtension(fileName);
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported file type: ${ext}`);
  }
}

/**
 * Reduces an uploaded filename to a safe basename for use in a storage key.
 * Strips any directory components (so `../` can't escape the user prefix) and
 * limits the result to a conservative charset; the original name is kept
 * separately for display. Falls back to "upload" if nothing usable remains.
 */
export function sanitizeFilename(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
  return cleaned || "upload";
}

export async function parseDocument(
  buffer: Buffer,
  fileName: string
): Promise<string> {
  validateDocument(buffer, fileName);

  const ext = getExtension(fileName);

  // Plain text — no conversion needed
  if (ext === ".md" || ext === ".txt") {
    return buffer.toString("utf-8").trim();
  }

  // All other formats — use markitdown via temp file
  const tmpPath = join(tmpdir(), `${randomUUID()}${ext}`);
  try {
    await writeFile(tmpPath, buffer);
    const md = new Markitdown();
    const result = await md.convert(tmpPath);
    const text = (result?.textContent ?? "").trim();
    if (!text) throw new Error(`Failed to extract text from ${fileName}`);
    return text;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}
