import { createServiceClient } from "@/lib/supabase";

// 24h chosen to fit the legal context: public-procurement documents are
// already public records (offentlighetsprincipen), so a long TTL is fine.
// Konsult-CV:n är inte offentliga men signerad URL bakom auth + explicit klick
// har samma korta exponeringsyta som analys-källvyn, så samma TTL används.
export const DEFAULT_DOC_TTL_SECONDS = 60 * 60 * 24;

const RFP_BUCKET = "rfp-documents";
export const CV_BUCKET = "consultant-cvs";

// En signeringsväg för alla privata buckets — RFP-dokument och konsult-CV:n delar
// exakt samma graceful mönster (service-klient, kasta vid fel/tomt svar). De
// exporterade wrapparna binder bucketen så anroparen aldrig råkar signera fel yta.
async function signBucketUrl(
  bucket: string,
  filePath: string,
  ttlSeconds: number,
): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(filePath, ttlSeconds);

  if (error) {
    throw new Error(`Failed to sign URL for ${filePath}: ${error.message}`);
  }
  if (!data?.signedUrl) {
    throw new Error(`No signedUrl returned for ${filePath}`);
  }
  return data.signedUrl;
}

export function getDocumentSignedUrl(
  filePath: string,
  ttlSeconds: number = DEFAULT_DOC_TTL_SECONDS,
): Promise<string> {
  return signBucketUrl(RFP_BUCKET, filePath, ttlSeconds);
}

export function getCvSignedUrl(
  filePath: string,
  ttlSeconds: number = DEFAULT_DOC_TTL_SECONDS,
): Promise<string> {
  return signBucketUrl(CV_BUCKET, filePath, ttlSeconds);
}
