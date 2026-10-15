'use client';

import { useState, useEffect } from 'react';
import { useToolDraft } from './tool-drafts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const TIMEZONES = [
  { label: '北京 (CST)', tz: 'Asia/Shanghai' },
  { label: '东京 (JST)', tz: 'Asia/Tokyo' },
  { label: '伦敦 (GMT/BST)', tz: 'Europe/London' },
  { label: '巴黎 (CET)', tz: 'Europe/Paris' },
  { label: '纽约 (EST/EDT)', tz: 'America/New_York' },
  { label: '洛杉矶 (PST/PDT)', tz: 'America/Los_Angeles' },
  { label: '悉尼 (AEST)', tz: 'Australia/Sydney' },
  { label: '迪拜 (GST)', tz: 'Asia/Dubai' },
];

function formatDatetime(date: Date, tz: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export default function TimeSync() {
  const [now, setNow] = useState<Date | null>(null);
  const [selectedTz, setSelectedTz] = useToolDraft('time.selectedTz', TIMEZONES[0].tz);

  // Unix → Date
  const [unixInput, setUnixInput] = useToolDraft('time.unixInput', '');
  const [unixResult, setUnixResult] = useToolDraft('time.unixResult', '');

  // Date → Unix
  const [dateInput, setDateInput] = useToolDraft('time.dateInput', '');
  const [dateResult, setDateResult] = useToolDraft('time.dateResult', '');

  useEffect(() => {
    const initialTick = window.setTimeout(() => setNow(new Date()), 0);
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearTimeout(initialTick);
      clearInterval(id);
    };
  }, []);

  function convertUnixToDate() {
    const ts = Number(unixInput.trim());
    if (!Number.isFinite(ts)) {
      setUnixResult('无效的 Unix 时间戳');
      return;
    }
    const d = new Date(ts * 1000);
    if (!Number.isFinite(d.getTime())) { setUnixResult('无效的 Unix 时间戳'); return; }
    setUnixResult(d.toISOString().replace('T', ' ').replace('.000Z', ' UTC'));
  }

  function convertDateToUnix() {
    const d = new Date(dateInput.trim());
    if (isNaN(d.getTime())) {
      setDateResult('无法解析日期，请使用 ISO 格式，例如：2024-06-01 12:00:00');
      return;
    }
    setDateResult(String(Math.floor(d.getTime() / 1000)));
  }

  if (!now) return <p role="status">正在读取本机时间…</p>;

  const localStr = now.toLocaleString('zh-CN', { hour12: false });
  const utcStr = now.toUTCString();
  const unixTs = Math.floor(now.getTime() / 1000);

  return (
    <div className="flex flex-col gap-5">
      {/* Current time display */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <TimeCard icon="schedule" label="本地时间" value={localStr} color="#4285F4" />
        <TimeCard icon="public" label="UTC 时间" value={utcStr} color="#34A853" />
        <TimeCard icon="tag" label="Unix 时间戳" value={String(unixTs)} color="#FBBC05" mono />
      </div>

      {/* Converter */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Unix → Date */}
        <div className="flex flex-col gap-2 rounded-[10px] border border-[var(--card-border)] p-4">
          <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">
            Unix → 日期
          </p>
          <Input
            aria-label="Unix 时间戳"
            value={unixInput}
            onChange={(e) => setUnixInput(e.target.value)}
            placeholder="输入 Unix 时间戳，如 1717200000"
          />
          <Button
            onClick={convertUnixToDate}
            className="self-start"
          >
            <span className="material-icons-round text-sm" aria-hidden="true">east</span>
            转换
          </Button>
          {unixResult && (
            <p className="text-sm font-mono break-all text-[var(--foreground)] bg-[var(--background)] rounded-[8px] border border-[var(--card-border)] px-3 py-2">
              {unixResult}
            </p>
          )}
        </div>

        {/* Date → Unix */}
        <div className="flex flex-col gap-2 rounded-[10px] border border-[var(--card-border)] p-4">
          <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">
            日期 → Unix
          </p>
          <Input
            aria-label="日期时间"
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            placeholder="如 2024-06-01T12:00:00"
          />
          <Button
            onClick={convertDateToUnix}
            className="self-start"
          >
            <span className="material-icons-round text-sm" aria-hidden="true">east</span>
            转换
          </Button>
          {dateResult && (
            <p className="text-sm font-mono break-all text-[var(--foreground)] bg-[var(--background)] rounded-[8px] border border-[var(--card-border)] px-3 py-2">
              {dateResult}
            </p>
          )}
        </div>
      </div>

      {/* Timezone selector */}
      <div className="flex flex-col gap-3 rounded-[10px] border border-[var(--card-border)] p-4">
        <div className="flex items-center gap-2">
          <span className="material-icons-round text-base text-[var(--muted-foreground)]">travel_explore</span>
          <p className="text-sm font-semibold text-[var(--foreground)]">时区对照</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {TIMEZONES.map((tz) => (
            <Button
              key={tz.tz}
              onClick={() => setSelectedTz(tz.tz)}
              variant={selectedTz === tz.tz ? 'default' : 'outline'}
              size="sm"
              aria-pressed={selectedTz === tz.tz}
            >
              {tz.label}
            </Button>
          ))}
        </div>
        <div className="rounded-[8px] bg-[var(--background)] border border-[var(--card-border)] px-4 py-3 font-mono text-base font-semibold text-[var(--foreground)]">
          {formatDatetime(now, selectedTz)}
        </div>
      </div>
    </div>
  );
}

function TimeCard({
  icon,
  label,
  value,
  color,
  mono,
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-[10px] border border-[var(--card-border)] bg-[var(--background)] p-4 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className="material-icons-round text-sm" style={{ color }}>
          {icon}
        </span>
        <span className="text-xs text-[var(--muted-foreground)]">{label}</span>
      </div>
      <p
        className={`text-sm font-semibold text-[var(--foreground)] break-all leading-snug ${mono ? 'font-mono text-lg' : ''}`}
      >
        {value}
      </p>
    </div>
  );
}
