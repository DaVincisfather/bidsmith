/**
 * Foreign-template surface toggle. Default OFF since 2026-08-03 (MD-first
 * launch decision): the onboarding pipeline is battle-tested only against our
 * own templates, and the launch story routes "your own format" through the
 * Markdown export instead. Set BIDSMITH_FOREIGN_TEMPLATES=on to opt in to the
 * experimental surface (upload/wizard/API); generation/rendering of
 * already-onboarded templates is never gated here.
 */
export function foreignTemplatesEnabled(): boolean {
  return process.env.BIDSMITH_FOREIGN_TEMPLATES === "on";
}
