import {
  computeProfileFields,
  countFilled,
  PROFILE_BID_SECTIONS,
  type ProfileFillInput,
} from "@/lib/profile-impact";

interface ProfileImpactPanelProps {
  /** Den aktiva profilen — null när ingen är aktiverad. */
  activeProfile: ProfileFillInput | null;
}

/**
 * Gör "hur mycket påverkar profilen anbud" synligt: var den används, vad som händer
 * när fält saknas, och hur stor del av rösten som faktiskt är ifylld. Presentationslager
 * — all logik bor i profile-impact.ts.
 */
export function ProfileImpactPanel({ activeProfile }: ProfileImpactPanelProps) {
  const fields = computeProfileFields(activeProfile);
  const filled = countFilled(fields);
  const total = fields.length;

  return (
    <section className="rounded-lg border border-rule bg-paper-2 p-6 space-y-5 text-sm">
      <div>
        <h2 className="text-base font-display font-normal text-ink">
          Så påverkar profilen anbuden
        </h2>
        <p className="mt-1 text-ink-mute">
          Den aktiva profilen injiceras först i AI:ns systemkontext för varje genererad
          anbudssektion. Den sätter röst och bolagsfakta för hela anbudet — inte bara omslaget.
        </p>
      </div>

      <div>
        <p className="font-medium text-ink-soft">Används i varje sektion</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PROFILE_BID_SECTIONS.map((section) => (
            <span
              key={section}
              className="rounded border border-rule px-2 py-0.5 text-xs text-ink-mute"
            >
              {section}
            </span>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <p className="font-medium text-ink-soft">Fyllnadsgrad</p>
          <span className="text-xs text-ink-mute">
            {filled} av {total} fält ifyllda
          </span>
        </div>
        <ul className="mt-2 space-y-2">
          {fields.map((field) => (
            <li key={field.key} className="flex items-start gap-2.5">
              <span
                aria-hidden
                className={
                  field.filled
                    ? "mt-1 h-2 w-2 shrink-0 rounded-full bg-accent"
                    : "mt-1 h-2 w-2 shrink-0 rounded-full border border-rule"
                }
              />
              <span>
                <span className={field.filled ? "font-medium text-ink" : "font-medium text-ink-mute"}>
                  {field.label}
                </span>
                <span className="sr-only">{field.filled ? " ifyllt" : " tomt"}</span>
                <span className="ml-1.5 text-ink-mute">{field.role}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-mute">
          Tomma fält = AI:n skriver utan den grunden, och texten blir mer generisk.
          {activeProfile ? "" : " Ingen profil är aktiv ännu — aktivera en nedan."}
        </p>
      </div>
    </section>
  );
}
