import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import './ui.css';

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return <input type={type} className={cn('jy-input', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn('jy-textarea', className)} {...props} />;
}
