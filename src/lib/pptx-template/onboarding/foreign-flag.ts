/**
 * Foreign-template surface toggle. Default OFF since 2026-08-03 (MD-first
 * launch decision): the onboarding pipeline is battle-tested only against our
 * own templates, and the launch story routes "your own format" through the
 * Markdown export instead. Set BIDSMITH_FOREIGN_TEMPLATES=on to opt in to the
 * experimental surface: upload/wizard/API, and — since 2026-08-11 — generation
 * itself. POST /api/bids refuses to generate when the active template carries a
 * foreign profile and this flag is off, so a switched-off surface cannot spend
 * money (it previously could: an already-active foreign template kept routing
 * down the profile path regardless of the flag). Rendering of an
 * already-generated bid is still not gated here.
 */
export function foreignTemplatesEnabled(): boolean {
  return process.env.BIDSMITH_FOREIGN_TEMPLATES === "on";
}
