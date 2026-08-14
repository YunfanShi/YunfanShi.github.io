import type { ReactNode } from 'react';

export function AdminPageHeader({ eyebrow = '运营控制台', title, description, actions }: { eyebrow?: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="flex flex-col justify-between gap-4 border-b border-[#eaecf0] pb-6 dark:border-white/10 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-[#155eef]">{eyebrow}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#667085] dark:text-[#98a2b3]">{description}</p></div>{actions && <div className="flex shrink-0 gap-2">{actions}</div>}</header>;
}
