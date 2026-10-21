'use client';

import { useState, useEffect, useRef } from 'react';
import QuizApp from '@/components/modules/quiz/quiz-app';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

const LS_VERSION_KEY = 'quizwise_version_preference';

export default function QuizPage() {
  const [version, setVersion] = useState<'react' | 'html' | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const selectedFromDialog = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem(LS_VERSION_KEY);
    queueMicrotask(() => {
      if (saved === 'react' || saved === 'html') setVersion(saved);
      else {
        setVersion('react');
        setShowDialog(true);
      }
    });
  }, []);

  const selectVersion = (v: 'react' | 'html') => {
    selectedFromDialog.current = true;
    localStorage.setItem(LS_VERSION_KEY, v);
    setVersion(v);
    setShowDialog(false);
    selectedFromDialog.current = false;
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (!open && !selectedFromDialog.current) {
      localStorage.setItem(LS_VERSION_KEY, 'react');
      setVersion(current => current ?? 'react');
    }
    setShowDialog(open);
  };

  // Also save preference to quiz_settings if available
  const syncToSettings = (v: 'react' | 'html') => {
    try {
      const parsed = JSON.parse(localStorage.getItem('quizwise_current_questions') || '{}');
      const current = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      current.versionPreference = v;
      localStorage.setItem('quizwise_current_questions', JSON.stringify(current));
    } catch {
      localStorage.setItem('quizwise_current_questions', JSON.stringify({ versionPreference: v }));
    }
  };

  const versionDialog = (
    <Dialog open={showDialog} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="animate-scale-in p-4 sm:p-6" closeLabel="关闭版本选择">
        <div className="mb-4 flex items-center gap-3">
          <span className="material-icons-round text-2xl text-[#4285F4]">psychology</span>
          <DialogTitle className="text-lg font-bold">选择 QuizWise 版本</DialogTitle>
        </div>
        <DialogDescription className="mb-6">请选择偏好的 QuizWise 版本。之后仍可随时切换。</DialogDescription>
        <div className="mb-6 grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 sm:gap-4">
          <Button variant="outline" onClick={() => selectVersion('html')} className="h-auto min-h-28 w-full flex-col gap-3 whitespace-normal border-2 p-5 text-left hover:border-[#4285F4]/40 hover:bg-[#4285F4]/5">
            <span className="material-icons-round text-3xl text-[#EA4335]">code</span>
            <span className="text-center"><strong className="block text-sm text-[var(--foreground)]">HTML 版本</strong><small className="mt-1 block text-xs leading-5 text-[var(--muted-foreground)]">独立网页应用<br />兼容旧数据</small></span>
          </Button>
          <Button variant="outline" onClick={() => selectVersion('react')} className="h-auto min-h-28 w-full flex-col gap-3 whitespace-normal border-2 p-5 text-left hover:border-[#34A853]/40 hover:bg-[#34A853]/5">
            <span className="material-icons-round text-3xl text-[#34A853]">integration_instructions</span>
            <span className="text-center"><strong className="block text-sm text-[var(--foreground)]">TSX 版本（推荐）</strong><small className="mt-1 block text-xs leading-5 text-[var(--muted-foreground)]">九种题型<br />支持主页 AI 生成测验</small></span>
          </Button>
        </div>
        <p className="text-center text-xs text-[var(--muted-foreground)]">选择后立即保存；设置中可再次切换。</p>
      </DialogContent>
    </Dialog>
  );

  // Show the HTML version in an iframe
  if (version === 'html') {
    return (
      <div className="-m-3 flex h-[calc(100%+1.5rem)] min-h-0 flex-col sm:-m-6 sm:h-[calc(100%+3rem)] lg:-m-8 lg:h-[calc(100%+4rem)]">
        {/* Version switcher bar */}
        <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--card-border)] bg-[var(--card)] px-3 py-2 sm:px-4">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="material-icons-round text-[var(--muted-foreground)] text-base">psychology</span>
            <span className="font-medium text-[var(--foreground)]">QuizWise 刷题</span>
            <span className="hidden text-xs text-[var(--muted-foreground)] px-2 py-0.5 rounded bg-[var(--background)] border border-[var(--card-border)] sm:inline">HTML 版</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-[var(--muted-foreground)] sm:inline">版本：</span>
            <Button
              variant={version === 'html' ? 'default' : 'outline'}
              size="sm"
              className="min-h-11 rounded-full px-3"
              aria-pressed={version === 'html'}
              onClick={() => {
                selectVersion('html');
                syncToSettings('html');
              }}
            >
              HTML
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 rounded-full px-3"
              aria-pressed={false}
              onClick={() => {
                selectVersion('react');
                syncToSettings('react');
              }}
            >
              TSX
            </Button>
          </div>
        </div>

        {/* HTML version in iframe */}
        <div className="flex-1">
          <iframe
            src="/QuizWise.html"
            className="w-full h-full border-0"
            title="QuizWise HTML Version"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            allow="clipboard-read; clipboard-write"
          />
        </div>

        {versionDialog}
      </div>
    );
  }

  // React version (default)
  return <><QuizApp />{versionDialog}</>;
}
