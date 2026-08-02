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
export const APP_VERSION = '3.0.3';

/**
 * DeepSeek V4 Flash 定价（元/百万 tokens）
 * 用于 AI 任务完成统计时的费用估算
 */
export const DEEPSEEK_V4_FLASH_PRICE = {
  inputPerMTokens: 1,      // 输入 ¥1 / 1M tokens
  outputPerMTokens: 2,     // 输出 ¥2 / 1M tokens
  cacheHitPerMTokens: 0.02, // 缓存命中 ¥0.02 / 1M tokens
} as const;

/**
 * 估算 AI 调用费用（元）
 * 默认使用 DeepSeek V4 Flash 定价
 */
export function estimateAiCost(
  inputTokens: number,
  outputTokens: number,
  prices = DEEPSEEK_V4_FLASH_PRICE,
): number {
  return (inputTokens / 1_000_000) * prices.inputPerMTokens
       + (outputTokens / 1_000_000) * prices.outputPerMTokens;
}
