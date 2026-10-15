'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import './ui.css';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

// Keep overlays inside the nearest explicit theme and the active fullscreen tree.
export function getDialogContainer(trigger: HTMLElement): HTMLElement {
  const themed = trigger.closest<HTMLElement>('[data-theme]');
  const fullscreen = document.fullscreenElement as HTMLElement | null;
  if (fullscreen) return themed && fullscreen.contains(themed) ? themed : fullscreen;
  return themed && themed !== document.documentElement ? themed : document.body;
}

export function DialogContent({ className, children, portalContainer, ...props }: ComponentProps<typeof DialogPrimitive.Content> & { portalContainer?: HTMLElement | null }) {
  return <DialogPrimitive.Portal container={portalContainer}>
    <DialogPrimitive.Overlay className="jy-dialog-overlay" />
    <DialogPrimitive.Content data-ui-dialog className={cn('jy-dialog-content', className)} {...props}>
      {children}
      <DialogPrimitive.Close asChild><Button variant="ghost" size="icon" className="jy-dialog-close" aria-label="关闭对话框">×</Button></DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>;
}
export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('pr-10 text-lg font-semibold', className)} {...props} />;
}
export function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('mt-2 text-sm leading-6 text-[var(--muted-foreground)]', className)} {...props} />;
}
