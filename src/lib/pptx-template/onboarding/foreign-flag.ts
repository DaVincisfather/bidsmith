/**
 * Foreign-template surface toggle. Default ON since 2026-07-19: the original
 * opt-in condition ("until the measurement gaps close", vägbeslutet 2026-07-14)
 * was fulfilled by the onboarding measurement pass + the HARD activation gate
 * (activationBlockReason) — an unmeasured/undefected foreign template cannot be
 * activated, so the gate now carries the safety this flag used to. Set
 * BIDSMITH_FOREIGN_TEMPLATES=off to hide the surface (upload/wizard/API);
 * generation/rendering of already-onboarded templates is never gated here.
 */
export function foreignTemplatesEnabled(): boolean {
  return process.env.BIDSMITH_FOREIGN_TEMPLATES !== "off";
}
