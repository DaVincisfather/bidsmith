export const CONSULTANT_SELECT = `
  *,
  consultant_competencies (id, competency, category),
  consultant_references (id, title, description, year, sector)
`;
