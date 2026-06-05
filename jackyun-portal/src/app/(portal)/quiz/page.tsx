'use client';

import { useState, useEffect } from 'react';
import QuizApp from '@/components/modules/quiz/quiz-app';

const LS_VERSION_KEY = 'quizwise_version_preference';

export default function QuizPage() {
  const [version, setVersion] = useState<'react' | 'html' | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(LS_VERSION_KEY);
    if (saved === 'react' || saved === 'html') {
      setVersion(saved);
    } else {
      // First time - show dialog
      setShowDialog(true);
    }
  }, []);

  const selectVersion = (v: 'react' | 'html') => {
    localStorage.setItem(LS_VERSION_KEY, v);
    setVersion(v);
    setShowDialog(false);
  };

  // Also save preference to quiz_settings if available
  const syncToSettings = (v: 'react' | 'html') => {
    const current = JSON.parse(localStorage.getItem('quizwise_current_questions') || '{}');
    if (current) {
      current.versionPreference = v;
      localStorage.setItem('quizwise_current_questions', JSON.stringify(current));
    }
  };

  // Show the HTML version in an iframe
  if (version === 'html') {
    return (
      <div className="flex flex-col h-full">
        {/* Version switcher bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--card-border)] bg-[var(--card)] flex-shrink-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="material-icons-round text-[var(--muted-foreground)] text-base">psychology</span>
            <span className="font-medium text-[var(--foreground)]">QuizWise 刷题</span>
            <span className="text-xs text-[var(--muted-foreground)] px-2 py-0.5 rounded bg-[var(--background)] border border-[var(--card-border)]">HTML 版</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--muted-foreground)]">版本：</span>
            <button
              onClick={() => {
                selectVersion('html');
                syncToSettings('html');
              }}
              className="px-3 py-1 rounded-full text-xs font-medium bg-[#4285F4]/10 text-[#4285F4] border border-[#4285F4]/30"
            >
              HTML
            </button>
            <button
              onClick={() => {
                selectVersion('react');
                syncToSettings('react');
              }}
              className="px-3 py-1 rounded-full text-xs font-medium text-[var(--muted-foreground)] hover:bg-[var(--background)] border border-transparent hover:border-[var(--card-border)] transition-colors"
            >
              TSX
            </button>
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

        {/* First-time selection dialog */}
        {showDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-6 animate-scale-in">
              <div className="flex items-center gap-3 mb-4">
                <span className="material-icons-round text-2xl text-[#4285F4]">psychology</span>
                <h2 className="text-lg font-bold text-[var(--foreground)]">选择 QuizWise 版本</h2>
              </div>

              <p className="text-sm text-[var(--muted-foreground)] mb-6">
                请选择你偏好的 QuizWise 版本。你可以稍后在设置中更改。
              </p>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <button
                  onClick={() => selectVersion('html')}
                  className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-[var(--card-border)] hover:border-[#4285F4]/40 hover:bg-[#4285F4]/5 transition-all text-left"
                >
                  <span className="material-icons-round text-3xl text-[#EA4335]">code</span>
                  <div className="text-center">
                    <p className="font-semibold text-[var(--foreground)] text-sm">HTML 版本</p>
                    <p className="text-xs text-[var(--muted-foreground)] mt-1">
                      独立网页应用<br />
                      加载速度更快<br />
                      完整的独立体验
                    </p>
                  </div>
                </button>

                <button
                  onClick={() => selectVersion('react')}
                  className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-[var(--card-border)] hover:border-[#34A853]/40 hover:bg-[#34A853]/5 transition-all text-left"
                >
                  <span className="material-icons-round text-3xl text-[#34A853]">integration_instructions</span>
                  <div className="text-center">
                    <p className="font-semibold text-[var(--foreground)] text-sm">TSX 版本 (React)</p>
                    <p className="text-xs text-[var(--muted-foreground)] mt-1">
                      与 Portal 主题一致<br />
                      更好的集成体验<br />
                      支持更多高级功能
                    </p>
                  </div>
                </button>
              </div>

              <p className="text-xs text-[var(--muted-foreground)] text-center">
                两个版本功能相同，你可以随时在设置中切换
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // React version (default)
  return <QuizApp />;
}