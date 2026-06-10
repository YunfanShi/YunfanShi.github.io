'use client';

import { useState, useCallback } from 'react';
import { saveSidebarPreferences } from '@/actions/settings';
import type { SidebarPreferences, MusicSidebarMode, AnswerSheetSidebarMode } from '@/actions/settings';

interface Props {
  initialPrefs: SidebarPreferences;
}

export default function SidebarPrefsPanel({ initialPrefs }: Props) {
  const [musicMode, setMusicMode] = useState<MusicSidebarMode>(initialPrefs.musicMode);
  const [answerSheetMode, setAnswerSheetMode] = useState<AnswerSheetSidebarMode>(initialPrefs.answerSheetMode);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const { error } = await saveSidebarPreferences({ musicMode, answerSheetMode });
    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }, [musicMode, answerSheetMode]);

  return (
    <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="material-icons-round text-[var(--muted-foreground)] text-lg">view_list</span>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          模块显示偏好
        </h2>
      </div>
      <p className="text-sm text-[var(--muted-foreground)] mb-4">
        选择你希望在侧边栏显示哪个版本的模块，另一个版本将被隐藏。
      </p>

      {/* Music module */}
      <div className="mb-4">
        <p className="text-sm font-medium text-[var(--foreground)] mb-2">🎵 音乐模块</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setMusicMode('player'); setSaved(false); }}
            className={`flex-1 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
              musicMode === 'player'
                ? 'border-[#4285F4] bg-[#4285F4]/10 text-[#4285F4]'
                : 'border-[var(--card-border)] text-[var(--foreground)] hover:border-[#4285F4]/30'
            }`}
          >
            音乐播放器
          </button>
          <button
            type="button"
            onClick={() => { setMusicMode('sync'); setSaved(false); }}
            className={`flex-1 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
              musicMode === 'sync'
                ? 'border-[#4285F4] bg-[#4285F4]/10 text-[#4285F4]'
                : 'border-[var(--card-border)] text-[var(--foreground)] hover:border-[#4285F4]/30'
            }`}
          >
            同步音乐
          </button>
        </div>
      </div>

      {/* Answer sheet module */}
      <div className="mb-5">
        <p className="text-sm font-medium text-[var(--foreground)] mb-2">📝 答题卡模块</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setAnswerSheetMode('standard'); setSaved(false); }}
            className={`flex-1 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
              answerSheetMode === 'standard'
                ? 'border-[#4285F4] bg-[#4285F4]/10 text-[#4285F4]'
                : 'border-[var(--card-border)] text-[var(--foreground)] hover:border-[#4285F4]/30'
            }`}
          >
            答题卡
          </button>
          <button
            type="button"
            onClick={() => { setAnswerSheetMode('sync'); setSaved(false); }}
            className={`flex-1 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
              answerSheetMode === 'sync'
                ? 'border-[#4285F4] bg-[#4285F4]/10 text-[#4285F4]'
                : 'border-[var(--card-border)] text-[var(--foreground)] hover:border-[#4285F4]/30'
            }`}
          >
            同步答题卡
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="px-5 py-2 rounded-lg bg-[#4285F4] text-white text-sm font-medium hover:bg-[#3367D6] transition-colors disabled:opacity-50"
      >
        {saving ? '保存中...' : saved ? '✓ 已保存' : '保存设置'}
      </button>
    </section>
  );
}