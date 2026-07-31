import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 当前版本号 — 每次发布时必须更新
 * 规则：Bug 修复 → 最后一位 +1（如 2.2.1 → 2.2.2）
 *       新功能 → 中间位 +1（如 2.2.1 → 2.3.0）
 *       大改版 → 第一位 +1
 */
export const APP_VERSION = '2.2.1';