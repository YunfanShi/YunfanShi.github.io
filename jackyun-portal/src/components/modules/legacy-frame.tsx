'use client';

import { useEffect, useRef, useState } from 'react';

interface LegacyFrameProps {
  src: string;
  title?: string;
}

export default function LegacyFrame({ src, title = 'Legacy Page' }: LegacyFrameProps) {
  const [srcdoc, setSrcdoc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(src);
        if (!res.ok) {
          setError(`加载失败: HTTP ${res.status}`);
          return;
        }
        let html = await res.text();

        // Inject <base> tag to resolve relative paths
        html = html.replace(
          /<head([^>]*)>/i,
          `<head$1><base href="${src}">`
        );

        // Inject aggressive CSS to hide legacy API key inputs + save buttons
        const hideCss = `
<style id="__llm_proxy_hide_css">
  /* API Key 输入类 */
  #aiKeyInp,
  #apiKeyInput,
  #apiKey,
  [id*="aiKey"],
  [id*="apiKey"],
  [id*="apikey"],
  button[id*="saveApiKey"],
  button[id*="saveKey"],
  button[id*="save_api"],
  .api-key-input,
  .api-key-section,
  .api-config-section,
  .ai-config-section,
  div:has(> #aiKeyInp),
  div:has(> #apiKeyInput),

  /* ── Relax / J.A.R.V.I.S ── */
  #model-select,
  #config-modal,
  button[onclick*="openConfig"],
  #key-deepseek,
  #key-qwen,
  #cfg-lang-chat,
  #cfg-lang-tts,
  #voice-select,

  /* ── Goal ── */
  #aiStatusBar,
  #apiProviderSel,
  #modelInput,
  #customEndpointRow,
  #customEndpointInput,

  /* ── MockPortal ── */
  #ai-panel-settings,
  #ai-tab-settings,
  #aiProvSel,
  #aiCustomEndpointRow,
  #aiCustomEndp,
  #aiCustomModel {
    display: none !important;
    visibility: hidden !important;
    height: 0 !important;
    width: 0 !important;
    overflow: hidden !important;
    opacity: 0 !important;
    position: absolute !important;
    pointer-events: none !important;
    margin: 0 !important;
    padding: 0 !important;
    border: none !important;
    clip: rect(0, 0, 0, 0) !important;
    clip-path: inset(50%) !important;
  }
</style>
`;
        html = html.replace(/<\/head>/i, `${hideCss}</head>`);

        // Inject request interception script (must run BEFORE any page script)
        const interceptScript = `
<script>
(function() {
  'use strict';

  // ═══════════════════════════════════════════
  // 1. localStorage 伪装 - 让所有 Key 检查通过
  // ═══════════════════════════════════════════
  var PLACEHOLDER = 'portal_managed_key_do_not_edit';
  var KNOWN_KEYS = [
    'ds_key', 'warden_ai_key', 'llm_key', 'ai_key', 'api_key',
    'jack_sk_ds', 'jack_sk_qw', 'openai_key', 'deepseek_key',
    'ai_api_key', 'warden_key', 'ai_provider', 'ai_model',
    'ai_custom_endpoint',
  ];

  var _origGetItem = localStorage.getItem.bind(localStorage);
  localStorage.getItem = function(key) {
    if (KNOWN_KEYS.indexOf(key) !== -1) {
      // Return placeholder so getKey()/aiKey() think it's configured
      return PLACEHOLDER;
    }
    return _origGetItem(key);
  };

  // Also intercept direct property access via Storage prototype
  // Some scripts might use localStorage['ds_key'] instead of getItem
  var _origStorageGet = Object.getOwnPropertyDescriptor(Storage.prototype, 'getItem');
  // Already handled above via localStorage.getItem override

  // ═══════════════════════════════════════════
  // 2. Request interception (fetch + XHR)
  // ═══════════════════════════════════════════

  // LLM provider domains to intercept
  var LLM_DOMAINS = [
    'api.openai.com',
    'api.deepseek.com',
    'api.anthropic.com',
    'generativelanguage.googleapis.com',
    'dashscope.aliyuncs.com',
    'open.bigmodel.cn',
    'api.moonshot.cn',
    'api.minimax.chat',
    'api.mistral.ai',
    'api.groq.com',
    'api.together.xyz',
  ];

  function isLlmRequest(url, init) {
    try {
      var u = typeof url === 'string' ? url : (url.url || url.toString());
      // Match known LLM domains
      for (var i = 0; i < LLM_DOMAINS.length; i++) {
        if (u.indexOf(LLM_DOMAINS[i]) !== -1) return true;
      }
      // Match any /chat/completions endpoint
      if (u.indexOf('/chat/completions') !== -1) return true;
      // Match if init has Authorization: Bearer header (external API call)
      if (init && init.headers) {
        var authHeader = init.headers['Authorization'] || init.headers['authorization'];
        if (authHeader && authHeader.indexOf('Bearer ') !== -1) {
          // Only intercept if it's an external URL (not our own API)
          if (u.indexOf(window.location.host) === -1 && u.indexOf('/api/') !== 0) {
            return true;
          }
        }
      }
    } catch(e) {}
    return false;
  }

  // Proxy to our unified endpoint
  function proxyToLlmProxy(url, options) {
    var body = options ? options.body : undefined;
    var proxyOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    };

    if (body) {
      try {
        if (typeof body === 'string') {
          proxyOptions.body = body;
        } else if (body instanceof ReadableStream) {
          return null; // Can't intercept streams
        }
      } catch(e) {
        return null;
      }
    } else {
      proxyOptions.body = JSON.stringify({ model: 'auto' });
    }

    return fetch('/api/llm-proxy', proxyOptions);
  }

  // Intercept fetch
  var _fetch = window.fetch;
  window.fetch = function(input, init) {
    if (isLlmRequest(input, init)) {
      console.log('[LLM Proxy] Intercepted fetch to:', typeof input === 'string' ? input : input.url);
      var proxied = proxyToLlmProxy(input, init);
      if (proxied) return proxied;
    }
    return _fetch.apply(this, arguments);
  };

  // Intercept XMLHttpRequest
  var XHR = window.XMLHttpRequest;
  var _open = XHR.prototype.open;
  var _send = XHR.prototype.send;

  XHR.prototype.open = function(method, url, async, user, password) {
    this.__llm_proxy_url = url;
    this.__llm_proxy_method = method;
    if (isLlmRequest(url)) {
      console.log('[LLM Proxy] Intercepted XHR to:', url);
      _open.call(this, 'POST', '/api/llm-proxy', async, user, password);
    } else {
      _open.call(this, method, url, async, user, password);
    }
  };

  XHR.prototype.send = function(body) {
    if (this.__llm_proxy_url && isLlmRequest(this.__llm_proxy_url)) {
      var jsonBody = body;
      if (typeof body === 'string') {
        try {
          jsonBody = JSON.parse(body);
        } catch(e) {}
      }
      _send.call(this, JSON.stringify(jsonBody || {}));
    } else {
      _send.call(this, body);
    }
  };

  // ═══════════════════════════════════════════
  // 3. MutationObserver - 隐藏动态创建的 AI 配置 UI
  // ═══════════════════════════════════════════
  var HIDE_SELECTORS = [
    '#aiKeyInp', '#apiKeyInput', '#apiKey',
    '#model-select', '#config-modal',
    '#aiStatusBar', '#apiProviderSel', '#modelInput',
    '#customEndpointRow', '#customEndpointInput',
    '#ai-panel-settings', '#ai-tab-settings',
    '#aiProvSel', '#aiCustomEndpointRow',
    '#aiCustomEndp', '#aiCustomModel',
    '#key-deepseek', '#key-qwen',
    '[onclick*="openConfig"]',
  ];

  function hideElement(el) {
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    el.style.setProperty('height', '0', 'important');
    el.style.setProperty('width', '0', 'important');
    el.style.setProperty('overflow', 'hidden', 'important');
    el.style.setProperty('opacity', '0', 'important');
    el.style.setProperty('position', 'absolute', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
    el.style.setProperty('margin', '0', 'important');
    el.style.setProperty('padding', '0', 'important');
    el.style.setProperty('border', 'none', 'important');
    el.style.setProperty('clip', 'rect(0, 0, 0, 0)', 'important');
    el.style.setProperty('clip-path', 'inset(50%)', 'important');
  }

  function hideMatches() {
    for (var i = 0; i < HIDE_SELECTORS.length; i++) {
      try {
        var els = document.querySelectorAll(HIDE_SELECTORS[i]);
        for (var j = 0; j < els.length; j++) {
          hideElement(els[j]);
        }
      } catch(e) {}
    }
  }

  // Run on load + watch for dynamically added elements
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      hideMatches();
      new MutationObserver(function(mutations) {
        for (var i = 0; i < mutations.length; i++) {
          if (mutations[i].addedNodes.length > 0) {
            hideMatches();
            break;
          }
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    });
  } else {
    hideMatches();
    new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].addedNodes.length > 0) {
          hideMatches();
          break;
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
})();
</script>
`;
        html = html.replace(/<\/head>/i, `${interceptScript}</head>`);

        if (!cancelled) {
          setSrcdoc(html);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载失败');
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [src]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-[var(--muted-foreground)]">
        ⚠️ {error}
      </div>
    );
  }

  if (srcdoc === null) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-[var(--muted-foreground)]">
        加载中...
      </div>
    );
  }

  return (
    <div style={{ margin: '-24px', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      <iframe
        ref={iframeRef}
        srcDoc={srcdoc}
        title={title}
        style={{ width: '100%', height: '100%', border: 'none' }}
        allow="autoplay; clipboard-read; clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-top-navigation"
      />
    </div>
  );
}