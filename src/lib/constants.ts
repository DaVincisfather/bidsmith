// Seed org — only used by cron routes (radar/fetch, radar/score) that have no user session.
// User-facing routes resolve the org via getOrgId() from the authenticated profile.
export const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

export const CONSULTANT_SELECT = `
  *,
  consultant_competencies (id, competency, category),
  consultant_references (id, title, description, year, sector)
`;
