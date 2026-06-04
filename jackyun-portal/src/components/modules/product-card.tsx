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
      className="group relative flex flex-col rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-sm hover:-translate-y-1 hover:shadow-md transition-all duration-200 overflow-hidden"
    >
      {/* Top color bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1 origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300"
        style={{ backgroundColor: color }}
      />

      {/* Icon */}
      <div
        className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${color}1A` }}
      >
        <span
          className="material-icons-round text-2xl"
          style={{ color }}
        >
          {icon}
        </span>
      </div>

      {/* Text */}
      <h3 className="text-base font-semibold text-[var(--foreground)]">
        {title}
      </h3>
      <p className="mt-1 text-sm text-[var(--muted-foreground)] line-clamp-2">
        {description}
      </p>

      {/* Arrow */}
      <div className="mt-auto pt-4 flex items-center text-xs font-medium" style={{ color }}>
        <span>进入</span>
        <span className="material-icons-round text-base ml-1 transition-transform group-hover:translate-x-1">
          arrow_forward
        </span>
      </div>
    </Link>
  );
}
