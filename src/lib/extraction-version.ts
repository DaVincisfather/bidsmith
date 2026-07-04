/**
 * Extraktions-generationens version. Skrivs på konsult-raden (consultants.extraction_version,
 * migration 011) vid varje upsert. En NON-NULL version säger "denna rad extraherades av
 * evidens-förankrade generationen" → legacy-grinden i grounded-claims.ts + evidence-badge.ts
 * stängs AV för raden: saknad evidens räknas som flaggad även om raden saknar evidens överallt
 * (den all-strippade degenererade konsulten skiljs därmed från en äkta legacy-konsult).
 *
 * NULL i DB = extraherad före kolumnen fanns (äkta legacy) → union-heuristiken gäller.
 *
 * Bump vid varje ny extraktions-generation vars grundnings-semantik ändras. Bor i en egen
 * pytte-lib (inte i consultant-extractor.ts) så det rena data-lagret (supabase.ts) kan
 * importera konstanten utan att dra in ai-client/models/schemas via extraktorn.
 */
export const EXTRACTION_VERSION = 1;
