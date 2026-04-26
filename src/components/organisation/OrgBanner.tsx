type Props = {
  displayName: string;
  logoUrl?: string | null;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function OrgBanner({ displayName, logoUrl }: Props) {
  return (
    <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={`${displayName} logo`}
          className="w-7 h-7 object-contain rounded"
        />
      ) : (
        <div className="w-7 h-7 rounded bg-gray-100 flex items-center justify-center text-[10px] font-semibold text-gray-600">
          {initials(displayName) || "—"}
        </div>
      )}
      <div className="text-sm font-semibold text-gray-900">{displayName}</div>
      <div className="text-xs text-gray-500">Din organisation</div>
    </div>
  );
}
