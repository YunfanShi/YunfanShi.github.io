import Link from 'next/link';

interface ProductCardProps {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  href: string;
}

export default function ProductCard({
  title,
  description,
  icon,
  color,
  href,
}: ProductCardProps) {
  return (
    <Link
      href={href}
      className="group relative flex min-h-52 flex-col overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[var(--surface-shadow)]"
    >
      {/* Top color bar */}
      <div
        className="absolute left-0 top-0 h-1 w-full origin-left scale-x-0 transition-transform duration-200 group-hover:scale-x-100"
        style={{ backgroundColor: color }}
      />

      {/* Icon */}
      <div
        className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105"
        style={{ backgroundColor: `${color}14` }}
      >
        <span
          className="material-icons-round text-2xl"
          style={{ color }}
        >
          {icon}
        </span>
      </div>

      {/* Text */}
      <h3 className="text-base font-medium text-[var(--foreground)]">
        {title}
      </h3>
      <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)] line-clamp-2">
        {description}
      </p>

      {/* Arrow */}
      <div className="mt-auto flex items-center pt-5 text-xs font-medium text-[var(--brand)]">
        <span>打开模块</span>
        <span className="material-icons-round ml-1 text-base transition-transform duration-200 group-hover:translate-x-1">
          arrow_forward
        </span>
      </div>
    </Link>
  );
}
