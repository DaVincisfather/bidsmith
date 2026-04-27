import { createServiceClient } from "@/lib/supabase";

// 24h chosen to fit the legal context: public-procurement documents are
// already public records (offentlighetsprincipen), so a long TTL is fine.
export const DEFAULT_DOC_TTL_SECONDS = 60 * 60 * 24;

const RFP_BUCKET = "rfp-documents";

export async function getDocumentSignedUrl(
  filePath: string,
  ttlSeconds: number = DEFAULT_DOC_TTL_SECONDS,
): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(RFP_BUCKET)
    .createSignedUrl(filePath, ttlSeconds);

  if (error) {
    throw new Error(`Failed to sign URL for ${filePath}: ${error.message}`);
  }
  if (!data?.signedUrl) {
    throw new Error(`No signedUrl returned for ${filePath}`);
  }
  return data.signedUrl;
}
