'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getActiveNotifications, dismissNotification } from '@/actions/admin';
import type { SiteNotification } from '@/types';

const DISMISSED_KEY = 'site_notification_dismissed';

// 使用映射表动态构造 HTML entity，避免格式化工具解码
const HTML_ESCAPES: Record<string, string> = {
  '&': '&' + 'amp;',
  '<': '&' + 'lt;',
  '>': '&' + 'gt;',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, (c) => HTML_ESCAPES[c] ?? c);
}

/**
 * 简易 Markdown 渲染器（支持常见语法）
 * 支持：标题、粗体、斜体、行内代码、代码块、链接、列表、引用、分隔线
 */
function renderMarkdown(md: string): string {
  let html = escapeHtml(md);

  // Code blocks (```lang ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) => {
    return `<pre style="background:#f5f5f5;padding:12px;border-radius:8px;overflow-x:auto;font-size:13px;line-height:1.5;margin:10px 0;"><code>${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`\n]+)`/g, '<code style="background:#f5f5f5;padding:2px 6px;border-radius:4px;font-size:0.9em;color:#d63384;">$1</code>');

  // Headings
  html = html.replace(/^### (.*)$/gm, '<h3 style="margin:14px 0 8px;font-size:16px;font-weight:700;">$1</h3>');
  html = html.replace(/^## (.*)$/gm, '<h2 style="margin:16px 0 8px;font-size:19px;font-weight:700;">$1</h2>');
  html = html.replace(/^# (.*)$/gm, '<h1 style="margin:18px 0 10px;font-size:24px;font-weight:800;">$1</h1>');

  // Bold
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:#4285F4;text-decoration:underline;">$1</a>');

  // Unordered list
  html = html.replace(/^[-*] (.*)$/gm, '<li style="margin:4px 0 4px 20px;list-style:disc;">$1</li>');
  // Ordered list
  html = html.replace(/^\d+\. (.*)$/gm, '<li style="margin:4px 0 4px 20px;list-style:decimal;">$1</li>');

  // Blockquote (after escapeHtml, '>' becomes '&' + 'gt;')
  const blockquoteEscaped = '&' + 'gt;';
  html = html.replace(
    new RegExp('^' + blockquoteEscaped + ' (.*)$', 'gm'),
    '<blockquote style="border-left:4px solid #ddd;padding:8px 12px;margin:10px 0;color:#666;background:#fafafa;border-radius:0 8px 8px 0;">$1</blockquote>',
  );

  // Horizontal rule
  html = html.replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid #eee;margin:14px 0;">');

  // Paragraphs
  html = html
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      // Wrap non-html blocks in paragraphs
      if (/^<(h\d|pre|blockquote|ul|ol|hr|li)/.test(block)) return block;
      // Inline line breaks
      block = block.replace(/\n/g, '<br>');
      return `<p style="margin:8px 0;line-height:1.7;">${block}</p>`;
    })
    .join('');

  return html;
}

function NotificationContent({ notification }: { notification: SiteNotification }) {
  if (notification.content_type === 'html') {
    return (
      <div
        className="notification-content"
        dangerouslySetInnerHTML={{ __html: notification.content }}
      />
    );
  }
  return (
    <div
      className="notification-content"
      style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--foreground)' }}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(notification.content) }}
    />
  );
}

export default function SiteNotificationModal() {
  const [notifications, setNotifications] = useState<SiteNotification[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const active = await getActiveNotifications();
        if (cancelled) return;

        const localDismissed = new Set<string>();
        try {
          const raw = localStorage.getItem(DISMISSED_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as string[];
            parsed.forEach((id) => localDismissed.add(id));
          }
        } catch {
          // ignore corrupt localStorage
        }

        const visible = active.filter((n) => !localDismissed.has(n.id));
        setNotifications(visible);
      } catch {
        // If not authenticated or any error, just don't show notifications
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const current = notifications[currentIndex];

  const handleClose = useCallback(async () => {
    if (!current) return;

    // 1. Write to localStorage immediately (offline fallback)
    try {
      const raw = localStorage.getItem(DISMISSED_KEY);
      const dismissed = raw ? (JSON.parse(raw) as string[]) : [];
      if (!dismissed.includes(current.id)) {
        dismissed.push(current.id);
        localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed));
      }
    } catch {
      // ignore
    }

    // 2. Persist to database
    try {
      await dismissNotification(current.id);
    } catch {
      // if this fails, localStorage still protects against re-showing
    }

    // 3. Move to next notification or close
    if (currentIndex < notifications.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setNotifications([]);
    }
  }, [current, currentIndex, notifications.length]);

  if (loading || !current) return null;

  return (
    <div
      className="site-notification-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'max(8px, env(safe-area-inset-top)) 8px max(8px, env(safe-area-inset-bottom))',
        animation: 'fadeIn 0.25s ease',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          background: 'var(--card, #ffffff)',
          borderRadius: '16px',
          maxWidth: '860px',
          width: '100%',
          maxHeight: 'calc(100dvh - 16px - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
          border: '1px solid var(--card-border, #e0e0e0)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--card-border, #eee)',
            background: 'var(--card, #fff)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              className="material-icons-round"
              style={{ color: '#4285F4', fontSize: '22px' }}
            >
              campaign
            </span>
            <h2
              style={{
                margin: 0,
                fontSize: '16px',
                fontWeight: 700,
                color: 'var(--foreground)',
              }}
            >
              {current.title || '公告'}
            </h2>
          </div>
          {notifications.length > 1 && (
            <span
              style={{
                fontSize: '12px',
                color: 'var(--muted-foreground)',
                background: 'var(--card-border, #f0f0f0)',
                padding: '2px 8px',
                borderRadius: '99px',
              }}
            >
              {currentIndex + 1} / {notifications.length}
            </span>
          )}
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
            background: 'var(--card, #fff)',
          }}
        >
          <NotificationContent notification={current} />
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--card-border, #eee)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            background: 'var(--card, #fff)',
            flexShrink: 0,
          }}
        >
          <button
            onClick={handleClose}
            style={{
              padding: '8px 24px',
              borderRadius: '8px',
              border: 'none',
              background: '#4285F4',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#3367d6')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#4285F4')}
          >
            {currentIndex < notifications.length - 1 ? '下一条' : '我知道了'}
          </button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .notification-content img {
          max-width: 100%;
          border-radius: 8px;
        }
        .notification-content table {
          width: 100%;
          border-collapse: collapse;
          margin: 10px 0;
        }
        .notification-content {
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .notification-content table {
          display: block;
          max-width: 100%;
          overflow-x: auto;
        }
        .notification-content table th,
        .notification-content table td {
          border: 1px solid var(--card-border, #e0e0e0);
          padding: 8px;
          font-size: 13px;
          text-align: left;
        }
        .notification-content table th {
          background: #f5f5f5;
          font-weight: 600;
        }
        .notification-content a {
          color: #4285F4;
          text-decoration: underline;
        }
        .notification-content ul, 
        .notification-content ol {
          padding-left: 20px;
          margin: 8px 0;
        }
      `}</style>
    </div>
  );
}
