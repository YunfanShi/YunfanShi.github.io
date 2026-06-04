'use client';

import { useState } from 'react';

interface Props {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export default function CollapsibleSection({ label, children, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-4 rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background)] transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="material-icons-round text-base text-[#4285F4]">
            {open ? 'expand_less' : 'expand_more'}
          </span>
          {label}
        </span>
        <span className="material-icons-round text-base text-[var(--muted-foreground)]">
          {open ? 'keyboard_arrow_up' : 'keyboard_arrow_down'}
        </span>
      </button>
      {open && <div className="border-t border-[var(--card-border)] p-4">{children}</div>}
    </div>
  );
}
