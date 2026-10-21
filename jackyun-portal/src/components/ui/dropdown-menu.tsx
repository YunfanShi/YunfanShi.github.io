'use client';

import * as Menu from '@radix-ui/react-dropdown-menu';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import './ui.css';

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export function DropdownMenuContent({ className, portalContainer, sideOffset = 6, ...props }: ComponentProps<typeof Menu.Content> & { portalContainer?: HTMLElement | null }) {
  return <Menu.Portal container={portalContainer}>
    <Menu.Content data-ui-menu sideOffset={sideOffset} collisionPadding={12} className={cn('jy-menu-content', className)} {...props} />
  </Menu.Portal>;
}
export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Menu.Item>) {
  return <Menu.Item className={cn('jy-menu-item', className)} {...props} />;
}
export function DropdownMenuSeparator(props: ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className="jy-menu-separator" {...props} />;
}
