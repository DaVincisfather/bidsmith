import styles from "./ForgeLoader.module.css";

const ANVIL_PATH =
  "M62 82 L120 82 L138 84 L152 91 L138 96 L120 98 L116 98 L116 104 L122 104 " +
  "L118 118 L126 118 L132 132 L68 132 L74 118 L82 118 L78 104 L84 104 L84 90 L62 90 Z";

function Striker({ mirror = false }: { mirror?: boolean }) {
  return (
    <g className={mirror ? styles.mirror : undefined}>
      <g className={styles.sparks}>
        <line x1="92.5" y1="78" x2="82" y2="72" />
        <line x1="96" y1="76" x2="96" y2="63" />
        <line x1="99.5" y1="78" x2="110" y2="72" />
      </g>
      <g className={styles.hammer}>
        {/* wooden handle */}
        <rect x="151" y="34" width="10" height="48" rx="2" fill="#8a6239" stroke="#5e3f24" strokeWidth="1.5" />
        {/* steel head + lighter striking face */}
        <rect x="130" y="20" width="52" height="22" rx="4" fill="#1d1a15" />
        <rect x="130" y="20" width="13" height="22" rx="4" fill="#3a352d" />
        {/* hand gripping the end */}
        <circle cx="156" cy="81" r="8.5" fill="#caa37a" stroke="#9c7850" strokeWidth="1.5" />
      </g>
    </g>
  );
}

export interface ForgeLoaderProps {
  /** Pixel size of the icon. Label scales with it. */
  size?: number;
  /** Text shown under the icon. Pass null to hide. Default: "Smider". */
  label?: string | null;
  className?: string;
}

/**
 * Brand loading indicator: a smith's hammer striking the Bidsmith anvil,
 * alternating right/left blows that fade in and out. Use for any async
 * "working on it" state (RFP analysis, consultant upload, matching, etc.).
 */
export function ForgeLoader({ size = 48, label = "Smider", className }: ForgeLoaderProps) {
  return (
    <div
      className={`${styles.wrap}${className ? ` ${className}` : ""}`}
      style={{ fontSize: Math.round(size * 0.26) }}
      role="status"
      aria-label={label ?? "Laddar"}
    >
      <svg
        className={styles.svg}
        viewBox="0 0 200 200"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <g className={styles.anvil} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="100" cy="100" r="92" strokeWidth="2" />
          <circle cx="100" cy="100" r="80" strokeWidth="1" />
          <path d={ANVIL_PATH} />
        </g>
        <Striker />
        <Striker mirror />
      </svg>
      {label !== null && (
        <span className={styles.label}>
          {label}
          <span className={styles.dots} aria-hidden="true">
            <span className={styles.dot}>.</span>
            <span className={styles.dot}>.</span>
            <span className={styles.dot}>.</span>
          </span>
        </span>
      )}
    </div>
  );
}
