// ==UserScript==
// @name         JackYun SEIUE 连接助手
// @namespace    https://jackyun.top/userscripts
// @version      1.0.0
// @description  由你点击后，从下一次个人课表只读请求临时读取 SEIUE 连接字段并复制给 JackYun。
// @include      /^https:\/\/chalk-[a-z0-9-]+\.seiue\.com\//i
// @exclude      https://api.seiue.com/*
// @exclude      https://passport.seiue.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(() => {
  'use strict';

  // The script is intentionally limited to school frontends such as chalk-c3.seiue.com.
  if (location.protocol !== 'https:' || !/^chalk-[a-z0-9-]+\.seiue\.com$/i.test(location.hostname)) return;

  const API_ORIGIN = 'https://api.seiue.com';
  const EVENT_PATH = /^\/chalk\/calendar\/personals\/([A-Za-z0-9_-]{1,200})\/events(?:\?|$)/;
  const requestHeaders = ['authorization', 'x-reflection-id', 'x-school-id', 'x-role'];
  let armed = false;
  let captured = null;
  let timeoutId = 0;
  let root = null;
  let statusNode = null;
  let captureButton = null;
  let copyButton = null;
  let originalFetch = null;
  let wrappedFetch = null;
  let originalOpen = null;
  let originalSetHeader = null;
  let originalSend = null;
  const xhrDetails = new WeakMap();

  function setStatus(message) {
    if (statusNode) statusNode.textContent = message;
  }

  function ensureUI() {
    if (root || !document.documentElement) return;
    const host = document.createElement('div');
    host.id = 'jy-seiue-helper';
    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `<style>
      :host{all:initial} .launcher{position:fixed;z-index:2147483646;right:14px;bottom:14px;box-shadow:0 4px 16px #0003}.box{position:fixed;z-index:2147483646;right:14px;bottom:14px;width:min(330px,calc(100vw - 28px));box-sizing:border-box;padding:14px;border:1px solid #d1d5db;border-radius:14px;background:#fff;color:#111827;font:13px/1.5 system-ui,sans-serif;box-shadow:0 8px 28px #0003}.box[hidden],.launcher[hidden]{display:none}
      .title{font-size:14px;font-weight:700;margin:0 0 5px}.text{margin:0 0 10px;color:#4b5563}.status{min-height:20px;margin:0 0 8px;color:#1f2937}.buttons{display:flex;gap:8px;flex-wrap:wrap}button{border:0;border-radius:999px;padding:8px 12px;font:600 12px system-ui,sans-serif;cursor:pointer;background:#155eef;color:#fff}button.secondary{background:#f3f4f6;color:#111827}button:disabled{opacity:.45;cursor:not-allowed}.close{position:absolute;right:9px;top:8px;background:transparent;color:#4b5563;padding:2px 7px;font-size:16px}
    </style><button class="launcher" type="button">SEIUE 连接助手</button><section class="box" role="status" aria-label="JackYun SEIUE 连接助手" hidden><button class="close" type="button" aria-label="关闭">×</button><p class="title">JackYun SEIUE 连接助手</p><p class="text">仅在你开始一次性捕获后，读取下一次个人课表 GET 请求中的学生 Token 和身份编号。不会读取密码或 Cookie，也不会联网或保存。</p><p class="status" aria-live="polite">未捕获。点击开始后，在 SEIUE 页面切换一周或刷新课表。</p><div class="buttons"><button class="capture" type="button">开始一次性捕获</button><button class="copy secondary" type="button" disabled>复制连接包</button></div></section>`;
    document.documentElement.appendChild(host);
    root = shadow;
    statusNode = shadow.querySelector('.status');
    captureButton = shadow.querySelector('.capture');
    copyButton = shadow.querySelector('.copy');
    const launcher = shadow.querySelector('.launcher');
    const panel = shadow.querySelector('.box');
    launcher.addEventListener('click', () => { panel.hidden = false; launcher.hidden = true; });
    shadow.querySelector('.close').addEventListener('click', () => { disarm(); captured = null; copyButton.disabled = true; panel.hidden = true; launcher.hidden = false; setStatus('已关闭面板并清除本页临时连接信息。'); });
    captureButton.addEventListener('click', arm);
    copyButton.addEventListener('click', copyBundle);
  }

  function isHeaderBag(value) {
    try { return new Headers(value); } catch { return new Headers(); }
  }

  function isTargetRequest(method, rawUrl) {
    if (String(method).toUpperCase() !== 'GET') return false;
    try {
      const url = new URL(rawUrl, location.href);
      return url.origin === API_ORIGIN && EVENT_PATH.test(`${url.pathname}${url.search}`);
    } catch { return false; }
  }

  function tryCapture(method, rawUrl, headers) {
    if (!armed || !isTargetRequest(method, rawUrl)) return;
    let url;
    try { url = new URL(rawUrl, location.href); } catch { return; }
    const values = {};
    for (const name of requestHeaders) values[name] = headers.get(name) || '';
    const pathMatch = EVENT_PATH.exec(`${url.pathname}${url.search}`);
    const reflectionId = values['x-reflection-id'] || pathMatch?.[1] || '';
    const token = /^Bearer\s+(.+)$/i.exec(values.authorization)?.[1]?.trim() || '';
    if (!token || token.length < 16 || token.length > 4000 || !/^[A-Za-z0-9_-]{1,200}$/.test(reflectionId) || !/^[A-Za-z0-9_-]{1,200}$/.test(values['x-school-id']) || values['x-role'] !== 'student') return;
    captured = { version: 1, token, reflectionId, schoolId: values['x-school-id'], role: 'student', schoolSite: `${location.origin}/` };
    disarm();
    if (copyButton) copyButton.disabled = false;
    setStatus('已在内存中捕获一次。令牌未显示、未保存；点击“复制连接包”后再粘贴到 JackYun。');
  }

  function arm() {
    if (captured) { setStatus('连接包已准备好。点击“复制连接包”复制后，再粘贴到 JackYun。'); return; }
    if (armed) { disarm(); setStatus('已取消一次性捕获。'); return; }
    armed = true;
    if (captureButton) captureButton.textContent = '取消捕获';
    setStatus('等待下一次个人课表只读请求（60 秒）。现在切换一周或刷新课表。');
    installHooks();
    timeoutId = window.setTimeout(() => { disarm(); setStatus('未在 60 秒内发现课表请求。重新点击开始后再切换一周。'); }, 60_000);
  }

  function installHooks() {
    originalFetch = window.fetch;
    wrappedFetch = function(input, init) {
      if (armed) {
        const rawUrl = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
        const method = init?.method || (input instanceof Request ? input.method : 'GET');
        const headers = isHeaderBag(input instanceof Request ? input.headers : undefined);
        if (init?.headers) isHeaderBag(init.headers).forEach((value, name) => headers.set(name, value));
        tryCapture(method, rawUrl, headers);
      }
      return originalFetch.apply(this, arguments);
    };
    window.fetch = wrappedFetch;

    const proto = XMLHttpRequest.prototype;
    originalOpen = proto.open;
    originalSetHeader = proto.setRequestHeader;
    originalSend = proto.send;
    proto.open = function(method, url) {
      xhrDetails.set(this, { method, url: String(url), headers: new Headers() });
      return originalOpen.apply(this, arguments);
    };
    proto.setRequestHeader = function(name, value) {
      const detail = xhrDetails.get(this);
      if (armed && detail && isTargetRequest(detail.method, detail.url) && requestHeaders.includes(String(name).toLowerCase())) {
        if (detail) detail.headers.set(name, value);
      }
      return originalSetHeader.apply(this, arguments);
    };
    proto.send = function() {
      const detail = xhrDetails.get(this);
      if (armed && detail) tryCapture(detail.method, detail.url, detail.headers);
      xhrDetails.delete(this);
      return originalSend.apply(this, arguments);
    };
  }

  function disarm() {
    armed = false;
    window.clearTimeout(timeoutId);
    if (originalFetch && window.fetch === wrappedFetch) window.fetch = originalFetch;
    if (originalOpen) XMLHttpRequest.prototype.open = originalOpen;
    if (originalSetHeader) XMLHttpRequest.prototype.setRequestHeader = originalSetHeader;
    if (originalSend) XMLHttpRequest.prototype.send = originalSend;
    originalFetch = null; wrappedFetch = null; originalOpen = null; originalSetHeader = null; originalSend = null;
    if (captureButton) captureButton.textContent = '开始一次性捕获';
  }

  async function copyBundle() {
    if (!captured) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(captured));
      captured = null;
      if (copyButton) copyButton.disabled = true;
      setStatus('已复制一次性连接包。请立刻粘贴到 JackYun 账户关联页；粘贴后清除剪贴板。');
    } catch {
      setStatus('浏览器未允许写入剪贴板。请检查当前网页权限后重试；令牌仍只在本页内存中。');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureUI, { once: true });
  else ensureUI();
})();
