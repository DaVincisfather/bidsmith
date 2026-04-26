"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Item = {
  href: string;
  label: string;
  hidden?: boolean;
};

export function OrgDropdown({ isSuperUser }: { isSuperUser: boolean }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const items: Item[] = [
    { href: "/organisation", label: "Översikt" },
    { href: "/consultants", label: "Konsulter" },
    { href: "/team", label: "Team", hidden: !isSuperUser },
    { href: "/organisation/settings", label: "Inställningar", hidden: !isSuperUser },
  ];
  const visible = items.filter((i) => !i.hidden);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1"
      >
        Din organisation
        <span aria-hidden className="text-xs">▾</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1 min-w-[180px] bg-white border border-gray-200 rounded-md shadow-md py-1 z-50"
        >
          {visible.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
