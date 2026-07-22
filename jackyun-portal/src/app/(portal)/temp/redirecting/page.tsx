'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

const XOR_KEY = 'JackWarden2024XOR';

function xorEncode(str: string): string {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    result += String.fromCharCode(str.charCodeAt(i) ^ XOR_KEY.charCodeAt(i % XOR_KEY.length));
  }
  return result;
}

interface RedirectInfo {
  url: string;
  name: string;
}

export default function RedirectingPage() {
  const searchParams = useSearchParams();
  const [info, setInfo] = useState<RedirectInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [countdown, setCountdown] = useState(3);

  // Auto-collapse sidebar for full-width redirect view
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('toggle-sidebar-collapse', { detail: { collapsed: true } }));
  }, []);

  useEffect(() => {
    try {
      const t = searchParams.get('t');
      if (!t) {
        setError('缺少跳转参数');
        return;
      }

      // Decode: base64 -> unescape -> XOR -> JSON
      const raw = atob(t);
      const xored = decodeURIComponent(escape(raw));
      const json = xorEncode(xored);
      const parsed: RedirectInfo = JSON.parse(json);

      // Security check: only allow http/https
      if (!parsed.url || !/^https?:\/\//i.test(parsed.url)) {
        setError('无效的跳转地址');
        return;
      }

      setInfo(parsed);
    } catch {
      setError('无效的跳转参数');
    }
  }, [searchParams]);

  const doRedirect = useCallback(() => {
    if (info) {
      window.location.href = info.url;
    }
  }, [info]);

  // Redirect countdown
  useEffect(() => {
    if (!info) return;

    const totalMs = 3000;
    const stepMs = 30;
    let elapsed = 0;

    const timer = setInterval(() => {
      elapsed += stepMs;
      const pct = Math.min((elapsed / totalMs) * 100, 100);
      setProgress(pct);

      const remaining = Math.max(0, Math.ceil((totalMs - elapsed) / 1000));
      setCountdown(remaining);

      if (elapsed >= totalMs) {
        clearInterval(timer);
        doRedirect();
      }
    }, stepMs);

    return () => clearInterval(timer);
  }, [info, doRedirect]);

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center p-5">
      <div className="bg-white p-12 sm:p-10 rounded-[28px] shadow-[0_1px_3px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.24)] max-w-sm w-full text-center transition-all duration-300 hover:shadow-[0_4px_12px_rgba(0,0,0,0.12),0_4px_8px_rgba(0,0,0,0.06)] hover:-translate-y-0.5">
        {/* Logo */}
        <div className="mb-5">
          <svg className="w-[52px] h-[52px] fill-[#1a73e8] mx-auto" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
          </svg>
        </div>

        {error ? (
          <>
            <h1 className="text-[26px] font-medium text-[#202124] mb-1 tracking-tight">跳转失败</h1>
            <p className="text-sm text-[#5f6368] mb-6 leading-relaxed">{error}</p>
            <div className="bg-[#f1f3f4] rounded-2xl p-4 mb-7 border border-transparent">
              <span className="text-sm font-medium text-[#1a73e8] flex items-center justify-center gap-3">
                <svg className="w-6 h-6 fill-[#1a73e8] shrink-0" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
                无效的跳转链接
              </span>
            </div>
          </>
        ) : info ? (
          <>
            <h1 className="text-[26px] font-medium text-[#202124] mb-1 tracking-tight">{info.name}</h1>
            <p className="text-sm text-[#5f6368] mb-8 leading-relaxed">正在准备跳转 …</p>

            {/* Target site card */}
            <div className="bg-[#e8f0fe] rounded-2xl p-4 mb-7 border border-[#1a73e8] flex items-center justify-center gap-3">
              <svg className="w-6 h-6 fill-[#1a73e8] shrink-0" viewBox="0 0 24 24">
                <path d="M20 18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/>
              </svg>
              <span className="text-sm font-medium text-[#1a73e8]">前往 {info.name}</span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1 bg-[#e0e0e0] rounded overflow-hidden mb-2.5">
              <div
                className="h-full bg-[#1a73e8] rounded transition-[width] duration-[30ms] linear"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-sm text-[#5f6368] font-normal min-h-5">
              {countdown > 0
                ? `正在重定向到 ${info.name} … ${countdown}s`
                : '即将跳转 …'}
            </p>

            {/* Manual redirect button */}
            <button
              onClick={doRedirect}
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1a73e8] text-white text-sm font-medium hover:bg-[#1557b0] transition-colors"
            >
              <span className="material-icons-round text-base">open_in_new</span>
              立即跳转
            </button>
          </>
        ) : (
          <>
            <h1 className="text-[26px] font-medium text-[#202124] mb-1 tracking-tight">加载中</h1>
            <p className="text-sm text-[#5f6368] mb-6 leading-relaxed">正在解析跳转信息 …</p>
            <div className="w-full h-1 bg-[#e0e0e0] rounded overflow-hidden mb-2.5">
              <div className="h-full bg-[#1a73e8] rounded animate-pulse" style={{ width: '50%' }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}