'use client';

import { useState } from 'react';

// Simple XOR cipher with a fixed key for URL obfuscation
const XOR_KEY = 'JackWarden2024XOR';

function xorEncode(str: string): string {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    result += String.fromCharCode(str.charCodeAt(i) ^ XOR_KEY.charCodeAt(i % XOR_KEY.length));
  }
  return result;
}

function xorDecode(str: string): string {
  // XOR is symmetric
  return xorEncode(str);
}

export function RedirectGenerator() {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function generate() {
    setError(null);
    setGeneratedUrl(null);
    setCopied(false);

    if (!name.trim()) {
      setError('请输入目标名称');
      return;
    }
    if (!url.trim()) {
      setError('请输入目标 URL');
      return;
    }
    if (!/^https?:\/\//i.test(url.trim())) {
      setError('URL 必须以 http:// 或 https:// 开头');
      return;
    }

    const payload = JSON.stringify({ url: url.trim(), name: name.trim() });
    const xored = xorEncode(payload);
    const encoded = btoa(unescape(encodeURIComponent(xored)));
    const baseUrl = window.location.origin;
    const redirectUrl = `${baseUrl}/temp/redirecting?t=${encoded}`;
    setGeneratedUrl(redirectUrl);
  }

  async function handleCopy() {
    if (!generatedUrl) return;
    try {
      await navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement('input');
      input.value = generatedUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleClear() {
    setName('');
    setUrl('');
    setGeneratedUrl(null);
    setError(null);
    setCopied(false);
  }

  return (
    <div className="space-y-4">
      {/* Input fields */}
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5 block flex items-center gap-1">
            <span className="material-icons-round text-sm">badge</span>
            目标名称
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：Star Citizen"
            className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5 block flex items-center gap-1">
            <span className="material-icons-round text-sm">link</span>
            目标 URL
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://robertsspaceindustries.com/en/"
            className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] transition-colors font-mono"
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={generate}
          className="flex items-center gap-1 px-4 py-2 rounded-lg bg-[#4285F4] text-white text-sm font-medium hover:bg-[#3367d6] transition-colors"
        >
          <span className="material-icons-round text-base">rocket_launch</span>
          生成跳转链接
        </button>
        <button
          onClick={handleClear}
          className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[var(--card-border)] text-sm text-[var(--muted-foreground)] hover:bg-[var(--card-border)]/10 transition-colors"
        >
          <span className="material-icons-round text-base">clear</span>
          清空
        </button>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-[#EA4335] bg-[#EA4335]/10 rounded-lg px-3 py-2 flex items-center gap-1">
          <span className="material-icons-round text-sm">error</span>
          {error}
        </p>
      )}

      {/* Generated URL */}
      {generatedUrl && (
        <div className="border border-[#34A853]/30 rounded-lg overflow-hidden">
          <div className="bg-[#34A853]/5 px-3 py-2 border-b border-[#34A853]/30 flex items-center gap-1">
            <span className="material-icons-round text-sm text-[#34A853]">check_circle</span>
            <span className="text-xs font-medium text-[#34A853]">已生成</span>
          </div>
          <div className="p-3">
            <div className="bg-[var(--background)] rounded-lg border border-[var(--card-border)] p-2.5 mb-2.5">
              <code className="text-xs text-[var(--foreground)] break-all font-mono select-all">
                {generatedUrl}
              </code>
            </div>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#34A853] text-white text-xs font-medium hover:bg-[#2d8f47] transition-colors"
            >
              <span className="material-icons-round text-sm">{copied ? 'check' : 'content_copy'}</span>
              {copied ? '已复制' : '复制链接'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}