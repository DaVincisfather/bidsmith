import pdfParse from "pdf-parse";
import mammoth from "mammoth";

const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".doc", ".md", ".txt"];

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

  switch (ext) {
    case ".pdf": {
      const result = await pdfParse(buffer);
      return result.text.trim();
    }
    case ".docx":
    case ".doc": {
      const result = await mammoth.extractRawText({ buffer });
      return result.value.trim();
    }
    case ".md":
    case ".txt": {
      return buffer.toString("utf-8").trim();
    }
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}
