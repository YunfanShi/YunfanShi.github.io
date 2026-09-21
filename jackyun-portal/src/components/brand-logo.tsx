import Image from 'next/image';

interface BrandLogoProps {
  size: number;
  className?: string;
  alt?: string;
  priority?: boolean;
}

export default function BrandLogo({ size, className, alt = 'JackYun', priority = false }: BrandLogoProps) {
  return (
    <Image
      src="/jackyun-logo.png"
      width={size}
      height={size}
      className={className}
      alt={alt}
      priority={priority}
    />
  );
}
