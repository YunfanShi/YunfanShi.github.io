'use client';

import { useEffect } from 'react';

/**
 * LegacyBridge - listens for postMessage events from legacy HTML iframes
 * and syncs localStorage data to Supabase via the API route.
 */
export default function LegacyBridge() {
  useEffect(() => {
    async function handleMessage(event: MessageEvent) {
      const msg = event.data;
      if (!msg || msg.source !== 'supabase-adapter') return;

      const { type, payload, requestId } = msg;

      if (type === 'request-init') {
        // Load user's legacy data and send back to iframe
        try {
          const res = await fetch('/api/legacy-sync', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          });
          const data = res.ok ? await res.json() : {};
          (event.source as WindowProxy)?.postMessage(
            { source: 'supabase-bridge', type: 'init-data', payload: data, requestId },
            event.origin || '*',
          );
        } catch {
          (event.source as WindowProxy)?.postMessage(
            { source: 'supabase-bridge', type: 'ready-ack', payload: null, requestId },
            event.origin || '*',
          );
        }
        return;
      }

      if (type === 'storage-set' && payload?.key) {
        // Persist to Supabase
        try {
          await fetch('/api/legacy-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: payload.key, value: payload.value }),
          });
        } catch {
          // silently fail — data is already in localStorage
        }
        return;
      }

      if (type === 'storage-remove' && payload?.key) {
        try {
          await fetch('/api/legacy-sync', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: payload.key }),
          });
        } catch {
          // silently fail
        }
        return;
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return null;
}
