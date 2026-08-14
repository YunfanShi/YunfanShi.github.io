'use client';

import { useEffect, useRef, useState } from 'react';

interface LegacyFrameProps {
  src: string;
  title?: string;
  /** Display name of the signed-in user (used to replace hardcoded names in legacy HTML). */
  userName?: string;
}

export default function LegacyFrame({ src, title = 'Legacy Page', userName }: LegacyFrameProps) {
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

        // Replace hardcoded names (e.g. "Jack") in legacy HTML with the
        // signed-in user's display name. Only visible text is touched —
        // brand names ("JackYun Portal") and localStorage keys are left alone.
        if (userName) {
          const display = userName;
          const displayUpper = display.toUpperCase();
          html = html
            .replace(/Jack's Warden/gi, `${display}'s Warden`)
            .replace(/JACK'S WARDEN/g, `${displayUpper}'S WARDEN`)
            .replace(/Jack's Exam Countdown/gi, `${display}'s Exam Countdown`)
            .replace(/Jack's Ecosystem/gi, `${display}'s Ecosystem`)
            .replace(/IGCSE Timer · Jack's Ecosystem/gi, `IGCSE Timer · ${display}'s Ecosystem`)
            .replace(/User: Jack \(9th Grade, IGCSE Student\)/g, `User: ${display} (Student)`);
        }

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
  // 3. 页面感知 postMessage — 告知父窗口当前实际页面
  // ═══════════════════════════════════════════
  // 根据 iframe 加载的 src 推断页面名并上报给父窗口
  var pageHint = '';
  try {
    var src = window.location.href || '';
    var fname = src.split('/').pop().split('?')[0].toLowerCase();
    var pageMap = {
      'goal.html': 'goal',
      'control.html': 'control',
      'timetablehub.html': 'timetablehub',
      'studyguide.html': 'study-guide',
      'studyplan.html': 'studyplan',
      'countdown.html': 'countdown',
      'igcountdown.html': 'igcountdown',
      'quizwise.html': 'quiz',
      'vocab.html': 'vocab',
      'musicplayer.html': 'music',
      'relax.html': 'relax',
      'mockportal.html': 'mockportal',
      'answersheet.html': 'answersheet',
      'bilibilisync.html': 'bilibili-sync',
      'poem.html': 'poem',
      'helpcenter.html': 'helpcenter'
    };
    pageHint = pageMap[fname] || fname.replace('.html','');
  } catch(e) {}

  function reportPage() {
    try {
      window.parent.postMessage({ type: 'jackyun-page', page: pageHint }, '*');
    } catch(e) {}
  }
  // 上报一次 + 监听 storage 变化（用户可能切换 iframe 页面）
  reportPage();
  window.addEventListener('focus', reportPage);
  window.addEventListener('load', function() { setTimeout(reportPage, 100); });

  // ═══════════════════════════════════════════
  // 4. MutationObserver - 隐藏动态创建的 AI 配置 UI
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

        // Inject localStorage sync script
        const syncScript = `
<script>
(function() {
  'use strict';

  // ═══════════════════════════════════════════
  // localStorage ↔ Supabase sync bridge
  // ═══════════════════════════════════════════
  // Explicit keys plus portal-owned prefixes are synced to cloud. This covers
  // legacy modules without copying browser-only/system keys or API placeholders.
  var SYNC_KEYS = [
    // Control / TimetableHub
    'jackyun_control_events',
    'w3_schedule',
    'th2_plans',
    'th2_active_plan_id',
    'th2_plan_',
    // Goal
    'jackyun_goal_data',
    'gt_v6',
    // IGCountdown / Exam Countdown
    'jackyun_igcountdown',
    // Countdown (倒计日)
    'jackyun_countdown_data',
    // Study (学习计划)
    'caie_schedule_current',
    'caie_progress_v2_1',
    'caie_syllabus_v3',
    'caie_settings_v2_1',
    'jackyun_syllabus_audit',
    'jackyun_traffic_',
    'jackyun_study_notes',
    // StudyGuide
    'studyguide_progress',
    // Mock / Quiz
    'mock_records',
    'quizwise_current_questions',
    // Bilibili
    'bilibili_sync_config',
    // Music
    'jackyun_music_playlists',
    // Vocab
    'jackyun_vocab_data',
    // Pomodoro
    'jackyun_pomodoro_tasks',
    'jackyun_pomodoro_settings',
    // Schedule flow (Goal → TimetableHub → Control)
    'jackyun_schedule_output',
    'jackyun_schedule_results',
  ];
  var SYNC_PREFIXES = ['jackyun_', 'th2_', 'gt_', 'w3_', 'caie_', 'studyguide_', 'mock_', 'quizwise_', 'bilibili_', 'igcse_'];
  function isSyncKey(key) {
    if (SYNC_KEYS.indexOf(key) !== -1) return true;
    for (var i = 0; i < SYNC_PREFIXES.length; i++) if (String(key).indexOf(SYNC_PREFIXES[i]) === 0) return true;
    return false;
  }

  var _origSetItem = localStorage.setItem.bind(localStorage);
  var _origGetItem = localStorage.getItem.bind(localStorage);
  var _syncQueue = {};
  var _syncTimer = null;

  // ── Timestamp ledger ──────────────────────────────────────────
  // Records the last-known timestamp per sync key so we can decide
  // whether the cloud copy is newer than the local copy. Stored in
  // localStorage so it survives page reloads.
  var TS_KEY = 'jackyun_sync_timestamps';
  var _localTs = {};
  function loadLocalTs() {
    try { var raw = _origGetItem(TS_KEY); if (raw) _localTs = JSON.parse(raw); } catch(e) { _localTs = {}; }
  }
  function setLocalTs(key, ts) {
    if (!key || typeof ts !== 'string' || !ts) return;
    _localTs[key] = ts;
    try { _origSetItem(TS_KEY, JSON.stringify(_localTs)); } catch(e) {}
  }

  // Attempt to load cloud data on every open. The cloud is authoritative so a
  // second device always receives the newest successfully synced state.
  function initSync() {
    fetch('/api/legacy-sync', { method: 'GET', headers: { 'Content-Type': 'application/json' } })
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(result) {
        if (!result || !result.ok || !result.data) return;
        var cloudData = result.data;
        var cloudTs = result.timestamps || {};
        var keys = Object.keys(cloudData);
        var pulled = 0;
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          if (!isSyncKey(k)) continue;
          var cloudVal = cloudData[k];
          if (cloudVal == null) continue;
          // Cloud state is intentionally authoritative on page open.
          var cTs = cloudTs[k];
          try {
            var strVal = typeof cloudVal === 'string' ? cloudVal : JSON.stringify(cloudVal);
            _origSetItem(k, strVal);
            if (cTs) setLocalTs(k, cTs);
            pulled++;
          } catch(e) {}
        }
        if (pulled > 0) console.log('[LegacySync] Cloud data loaded:', pulled, 'keys');
        // Notify the page (and any embedded app) that cloud data arrived,
        // so it can re-initialize from the freshest copy.
        try { window.dispatchEvent(new CustomEvent('jackyun-cloud-synced', { detail: { pulled: pulled } })); } catch(e) {}
      })
      .catch(function() { /* not logged in or offline — ignore */ });
  }

  // Debounced push to server
  function flushSync() {
    if (_syncTimer) clearTimeout(_syncTimer);
    _syncTimer = setTimeout(function() {
      var keys = Object.keys(_syncQueue);
      if (keys.length === 0) return;
      var data = {};
      for (var i = 0; i < keys.length; i++) {
        data[keys[i]] = _syncQueue[keys[i]];
      }
      _syncQueue = {};

      // Push each key individually
      var pushNext = function(idx) {
        if (idx >= keys.length) return;
        var key = keys[idx];
        fetch('/api/legacy-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: key, value: data[key] }),
        }).then(function(r) {
          // Record server timestamp so a later refresh won't clobber it
          if (r && r.ok) {
            r.json().then(function(j) { if (j && j.timestamp) setLocalTs(key, j.timestamp); })
             .catch(function() {});
          }
          pushNext(idx + 1);
        }).catch(function() { pushNext(idx + 1); });
      };
      pushNext(0);
    }, 2000); // 2s debounce — user asked for refresh-based sync, not realtime
  }

  // Do not lose a final edit when a user closes or switches away from a legacy page.
  function flushBeforeLeave() {
    if (_syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }
    var keys = Object.keys(_syncQueue);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      try {
        fetch('/api/legacy-sync', {
          method: 'POST', keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: key, value: _syncQueue[key] }),
        });
      } catch(e) {}
    }
    _syncQueue = {};
  }

  // Override setItem to intercept sync keys
  localStorage.setItem = function(key, value) {
    _origSetItem(key, value);
    if (isSyncKey(key)) {
      try {
        _syncQueue[key] = typeof value === 'string' ? JSON.parse(value) : value;
      } catch(e) {
        _syncQueue[key] = value;
      }
      setLocalTs(key, new Date().toISOString());
      flushSync();
    }
  };

  // Also intercept removeItem for sync keys
  var _origRemoveItem = localStorage.removeItem.bind(localStorage);
  localStorage.removeItem = function(key) {
    _origRemoveItem(key);
    if (isSyncKey(key)) {
      _syncQueue[key] = null;
      setLocalTs(key, new Date().toISOString());
      flushSync();
    }
  };

  window.addEventListener('pagehide', flushBeforeLeave);

  // Load the timestamp ledger before anything else
  loadLocalTs();

  // Pull latest cloud data when the page opens.
  if (document.readyState === 'complete') {
    setTimeout(initSync, 100);
  } else {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(initSync, 100); });
  }
})();
</script>
`;
        html = html.replace(/<\/head>/i, `${syncScript}</head>`);

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
    <div className="-m-4 h-[calc(100vh-72px)] overflow-hidden sm:-m-6 lg:-m-8">
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
