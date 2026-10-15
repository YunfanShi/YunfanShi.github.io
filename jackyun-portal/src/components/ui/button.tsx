'use client';

import { useRef, useState, type ComponentProps } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import './ui.css';

const buttonVariants = cva('jy-button', {
  variants: {
    variant: { default: 'jy-button-primary', outline: 'jy-button-outline', ghost: 'jy-button-ghost', destructive: 'jy-button-destructive' },
    size: { default: '', sm: 'jy-button-sm', icon: 'jy-button-icon' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

type ButtonProps = ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean; busy?: boolean };

export function Button({ className, variant, size, asChild, busy = false, disabled, onClick, type, children, ...props }: ButtonProps) {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const Component = asChild ? Slot : 'button';
  return (
    <Component {...props} type={asChild ? undefined : type ?? 'button'} disabled={disabled || busy || pending}
      aria-busy={busy || pending || undefined} aria-disabled={disabled || busy || pending || undefined} className={cn(buttonVariants({ variant, size }), className)}
      onClick={async event => {
        if (disabled || busy || inFlight.current) { event.preventDefault(); return; }
        inFlight.current = true;
        try {
          const result: unknown = onClick?.(event);
          if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
            setPending(true);
            await result;
          }
        } finally { inFlight.current = false; setPending(false); }
      }}>
      {children}
    </Component>
  );
}
