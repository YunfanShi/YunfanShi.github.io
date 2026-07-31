'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

interface ToolCard {
  id: string;
  title: string;
  description: string;
  icon: string;
  emoji: string;
  color: string;
  bgColor: string;
  href: string;
}

const TOOLS: ToolCard[] = [
  {
    id: 'pomodoro',
    title: '番茄钟',
    description: '番茄工作法 · 保持专注',
    icon: 'lunch_dining',
    emoji: '🍅',
    color: '#EA4335',
    bgColor: '#FCE8E6',
    href: '/pomodoro',
  },
  {
    id: 'exam-countdown',
    title: '倒计时',
    description: '考试倒计时 · 备考冲刺',
    icon: 'hourglass_empty',
    emoji: '⏳',
    color: '#4285F4',
    bgColor: '#E8F0FE',
    href: '/examcountdown',
  },
  {
    id: 'count-down',
    title: '倒计日',
    description: '重要日期 · 天数记录',
    icon: 'event_available',
    emoji: '📅',
    color: '#34A853',
    bgColor: '#E6F4EA',
    href: '/countdown',
  },
];

export default function TimeManagementPage() {
  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[var(--foreground)]">
          ⏱ 时间管理
        </h1>
        <p className="mt-1 text-[var(--muted-foreground)]">
          选择你需要的计时工具
        </p>
      </div>

      {/* Tool cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {TOOLS.map((tool) => (
          <Link
            key={tool.id}
            href={tool.href}
            className="group relative overflow-hidden rounded-[16px] border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-sm transition-all hover:shadow-lg hover:-translate-y-0.5"
          >
            {/* Icon */}
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4"
              style={{ background: tool.bgColor }}
            >
              <span className="material-icons-round text-3xl" style={{ color: tool.color }}>
                {tool.icon}
              </span>
            </div>

            {/* Title */}
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-1">
              {tool.title}
            </h2>

            {/* Description */}
            <p className="text-sm text-[var(--muted-foreground)]">
              {tool.description}
            </p>

            {/* Arrow */}
            <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[var(--background)] flex items-center justify-center text-[var(--muted-foreground)] opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="material-icons-round text-base">arrow_forward</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Bottom note */}
      <div className="mt-12 rounded-[16px] border border-[var(--card-border)] bg-[var(--card)] p-6">
        <h3 className="text-base font-semibold text-[var(--foreground)] mb-2">
          💡 小贴士
        </h3>
        <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
          使用番茄钟保持专注，使用倒计时冲刺备考，使用倒计日记录重要日子。
          以上工具的侧边栏入口已统一收纳到这里。
        </p>
      </div>
    </div>
  );
}