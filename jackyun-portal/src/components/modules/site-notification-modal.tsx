'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getActiveNotifications, dismissNotification } from '@/actions/admin';
import type { SiteNotification } from '@/types';
import { useAuthMode } from '@/components/auth/auth-mode-provider';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

const DISMISSED_KEY = 'site_notification_dismissed';

function NotificationContent({ notification }: { notification: SiteNotification }) {
  return (
    <div className="notification-content prose prose-sm max-w-none text-[var(--foreground)] dark:prose-invert">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={notification.content_type === 'html' ? [rehypeRaw, rehypeSanitize] : [rehypeSanitize]}
        components={{
          a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
        }}
      >
        {notification.content}
      </ReactMarkdown>
    </div>
  );
}

export default function SiteNotificationModal() {
  const { signedIn } = useAuthMode();
  const [notifications, setNotifications] = useState<SiteNotification[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (!signedIn) {
      queueMicrotask(() => setLoading(false));
      return;
    }
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
  }, [signedIn]);

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
    if (signedIn) {
      try { await dismissNotification(current.id); } catch { /* Local dismissal remains authoritative offline. */ }
    }

    // 3. Move to next notification or close
    if (currentIndex < notifications.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setNotifications([]);
    }
  }, [current, currentIndex, notifications.length, signedIn]);

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
