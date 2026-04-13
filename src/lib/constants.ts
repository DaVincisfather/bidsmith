// Single-tenant default — will be replaced by session-based org ID when auth is added
export const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

export const CONSULTANT_SELECT = `
  *,
  consultant_competencies (id, competency, category),
  consultant_references (id, title, description, year, sector)
`;
