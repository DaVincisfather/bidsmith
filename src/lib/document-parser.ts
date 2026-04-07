import Markitdown from "markitdown-js";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".doc", ".pptx", ".xlsx", ".md", ".txt"];

function getExtension(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop();
  return ext ? `.${ext}` : "";
}

export async function parseDocument(
  buffer: Buffer,
  fileName: string
): Promise<string> {
  const ext = getExtension(fileName);

  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported file type: ${ext}`);
  }

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
    if (!result) throw new Error(`Failed to parse ${fileName}`);
    return (result.textContent ?? "").trim();
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}
