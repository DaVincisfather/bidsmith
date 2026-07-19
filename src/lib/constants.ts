// The Team & Pris slide has exactly 5 member slots, and the team bundle's
// structured-output schema hard-caps `members` at this count. The team-picker
// UI must enforce the SAME cap — otherwise selecting >5 consultants lets the
// model silently drop the overflow (they vanish from the export with no
// warning). Single source of truth so the UI and the schema can't drift.
export const MAX_TEAM_SIZE = 5;

export const CONSULTANT_SELECT = `
  *,
  consultant_competencies (id, competency, category, evidence),
  consultant_references (id, title, description, year, sector, evidence)
`;

// API-facing variant: explicit column list WITHOUT raw_cv_text. The full CV
// is PII and must not be returned to the browser — routes that serialize
// consultant rows straight into the response use this select.
//
// evidence (det verifierade CV-citatet, migration 009) tas MED: klienten måste
// kunna round-tripa citatet vid manuell redigering utan att förlora det. Citatet
// är ett kort ordagrant utdrag ur CV:t (inte hela CV:t) och röjer därför ingen PII
// utöver det påstående det redan grundar.
export const CONSULTANT_API_SELECT = `
  id, name, level, years_experience, summary, extraction_version, created_at, updated_at,
  consultant_competencies (id, competency, category, evidence),
  consultant_references (id, title, description, year, sector, evidence)
`;
