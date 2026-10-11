'use client';

import { useEffect } from 'react';

/**
 * LegacyBridge - listens for postMessage events from legacy HTML iframes
 * and acknowledges their initialization handshake. The parent workspace sync
 * owns cloud reads and durable outbox writes so legacy pages cannot bypass v2.
 */
export default function LegacyBridge() {
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      // Sandboxed/foreign frames can send opaque-origin messages during route
      // changes. Only our same-origin adapter is eligible for a handshake.
      if (event.origin !== window.location.origin || !event.source) return;
      const msg = event.data;
      if (!msg || msg.source !== 'supabase-adapter') return;

      const { type, requestId } = msg;

      if (type === 'request-init') {
        (event.source as WindowProxy)?.postMessage(
          { source: 'supabase-bridge', type: 'ready-ack', payload: null, requestId },
          event.origin,
        );
      }

      // storage-set/storage-remove are intentionally ignored here. They already
      // changed same-origin localStorage and LocalWorkspaceSync will durably
      // enqueue them before any cloud pull can overwrite the key.
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return null;
}
