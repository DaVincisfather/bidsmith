export const CONSULTANT_SELECT = `
  *,
  consultant_competencies (id, competency, category),
  consultant_references (id, title, description, year, sector)
`;

// API-facing variant: explicit column list WITHOUT raw_cv_text. The full CV
// is PII and must not be returned to the browser — routes that serialize
// consultant rows straight into the response use this select.
export const CONSULTANT_API_SELECT = `
  id, name, level, years_experience, summary, created_at, updated_at,
  consultant_competencies (id, competency, category),
  consultant_references (id, title, description, year, sector)
`;
