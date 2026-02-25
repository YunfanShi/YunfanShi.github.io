/**
 * supabase-adapter.js
 * Bridge script that intercepts localStorage and syncs data to Supabase
 * via postMessage communication with the Next.js parent frame.
 */
(function () {
  'use strict';

  const ADAPTER_VERSION = '1.0.0';
  const MESSAGE_ORIGIN = '*'; // same-origin, safe to use wildcard

  // Track pending requests
  const pendingRequests = new Map();
  let requestCounter = 0;
  let adapterReady = false;
  const readyCallbacks = [];

  // ── postMessage helpers ──────────────────────────────────────────────
  function sendToParent(type, payload, requestId) {
    if (window.parent === window) return; // not inside iframe, skip
    window.parent.postMessage(
      { source: 'supabase-adapter', type, payload, requestId },
      MESSAGE_ORIGIN,
    );
  }

  function request(type, payload) {
    return new Promise((resolve) => {
      const requestId = ++requestCounter;
      pendingRequests.set(requestId, resolve);
      sendToParent(type, payload, requestId);
      // Fallback: if parent doesn't respond within 2 seconds, resolve with null
      setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          pendingRequests.delete(requestId);
          resolve(null);
        }
      }, 2000);
    });
  }

  // ── localStorage proxy ───────────────────────────────────────────────
  const _origGetItem = Storage.prototype.getItem;
  const _origSetItem = Storage.prototype.setItem;
  const _origRemoveItem = Storage.prototype.removeItem;

  Storage.prototype.getItem = function (key) {
    const val = _origGetItem.call(this, key);
    // Fire-and-forget sync notification (async read from parent is not blocking)
    return val;
  };

  Storage.prototype.setItem = function (key, value) {
    _origSetItem.call(this, key, value);
    // Notify parent of the change
    sendToParent('storage-set', { key, value });
  };

  Storage.prototype.removeItem = function (key) {
    _origRemoveItem.call(this, key);
    sendToParent('storage-remove', { key });
  };

  // ── Incoming messages from parent ────────────────────────────────────
  window.addEventListener('message', function (event) {
    const msg = event.data;
    if (!msg || msg.source !== 'supabase-bridge') return;

    if (msg.type === 'response' && msg.requestId) {
      const resolve = pendingRequests.get(msg.requestId);
      if (resolve) {
        pendingRequests.delete(msg.requestId);
        resolve(msg.payload);
      }
      return;
    }

    if (msg.type === 'init-data' && msg.payload) {
      // Populate localStorage with data from Supabase
      const data = msg.payload;
      if (data && typeof data === 'object') {
        Object.entries(data).forEach(([key, value]) => {
          try {
            _origSetItem.call(localStorage, key, typeof value === 'string' ? value : JSON.stringify(value));
          } catch (e) {
            // ignore quota errors
          }
        });
      }
      adapterReady = true;
      readyCallbacks.forEach((cb) => cb());
      readyCallbacks.length = 0;
    }

    if (msg.type === 'ready-ack') {
      adapterReady = true;
      readyCallbacks.forEach((cb) => cb());
      readyCallbacks.length = 0;
    }
  });

  // ── Public API ───────────────────────────────────────────────────────
  window.__supabaseAdapter = {
    version: ADAPTER_VERSION,

    /** Returns true if we are running inside the Next.js portal iframe */
    isEmbedded: function () {
      return window.parent !== window;
    },

    /** Request the parent to load all user data for this page */
    requestInitialData: function (pageKey) {
      sendToParent('request-init', { pageKey });
    },

    /** Manually sync a key to Supabase */
    sync: function (key, value) {
      sendToParent('storage-set', { key, value });
    },

    /** Register a callback to fire once initial data has been loaded */
    onReady: function (cb) {
      if (adapterReady) {
        cb();
      } else {
        readyCallbacks.push(cb);
      }
    },
  };

  // Request initial data on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      sendToParent('request-init', { pageKey: window.location.pathname });
    });
  } else {
    sendToParent('request-init', { pageKey: window.location.pathname });
  }

  // If not embedded (direct access), mark as ready immediately
  if (window.parent === window) {
    adapterReady = true;
  }
})();
