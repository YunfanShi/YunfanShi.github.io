// ==UserScript==
// @name         Discord 图片拦截器 · Image Shield
// @namespace    https://discord.com
// @version      2.0.0
// @description  在学校/工作场所安全使用 Discord — 拦截所有聊天图片，可单张解锁，Material Design 3 风格界面
// @author       Image Shield
// @match        https://discord.com/channels/@me/1504626306703298681
// @match        https://ptb.discord.com/*
// @match        https://canary.discord.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ─────────────────────────────────────────────
  //  STATE & STORAGE
  // ─────────────────────────────────────────────
  const STORE_KEY = 'imageShield_v2';

  const defaultSettings = {
    enabled: true,
    mode: 'all',          // 'all' | 'others' | 'mine'
    style: 'placeholder', // 'placeholder' | 'blur'
    blurAmount: 18,
    unlockedIds: {},      // id -> true
  };

  function loadSettings() {
    try {
      const raw = GM_getValue(STORE_KEY, null);
      return raw ? { ...defaultSettings, ...JSON.parse(raw) } : { ...defaultSettings };
    } catch {
      return { ...defaultSettings };
    }
  }

  function saveSettings() {
    GM_setValue(STORE_KEY, JSON.stringify(settings));
  }

  let settings = loadSettings();
  let blockedCount = 0;

  // ─────────────────────────────────────────────
  //  INJECT GLOBAL CSS
  // ─────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    /* ─── MD3 Design Tokens ─── */
    :root {
      --is-primary: #1a73e8;
      --is-primary-light: #e8f0fe;
      --is-on-primary: #fff;
      --is-surface: #fff;
      --is-surface-variant: #f8f9fa;
      --is-outline: #dadce0;
      --is-outline-soft: #e8eaed;
      --is-text: #202124;
      --is-text-secondary: #5f6368;
      --is-error: #d93025;
      --is-success: #1e8e3e;
      --is-shadow: rgba(32,33,36,.12);
      --is-shadow-lg: rgba(32,33,36,.24);
      --is-radius: 12px;
      --is-radius-sm: 8px;
      --is-radius-full: 999px;
      --is-transition: .2s cubic-bezier(.4,0,.2,1);
    }

    /* ─── Placeholder Chip ─── */
    .is-placeholder {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 120px;
      min-height: 80px;
      max-width: 420px;
      width: 100%;
      background: linear-gradient(135deg, #f0f4ff 0%, #e8f0fe 100%);
      border: 1.5px dashed #aac4ff;
      border-radius: var(--is-radius);
      cursor: pointer;
      overflow: hidden;
      transition: all var(--is-transition);
      box-sizing: border-box;
      margin: 2px 0;
    }
    .is-placeholder::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, transparent 0%, rgba(26,115,232,.04) 100%);
      opacity: 0;
      transition: opacity var(--is-transition);
    }
    .is-placeholder:hover::before { opacity: 1; }
    .is-placeholder:hover {
      border-color: var(--is-primary);
      transform: scale(1.01);
      box-shadow: 0 2px 8px var(--is-shadow);
    }
    .is-placeholder:active { transform: scale(.99); }

    .is-placeholder-inner {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 14px 20px;
      pointer-events: none;
      user-select: none;
    }
    .is-placeholder-icon {
      width: 32px;
      height: 32px;
      color: #7aa7ff;
    }
    .is-placeholder-label {
      font-family: 'Google Sans', 'Segoe UI', sans-serif;
      font-size: 11.5px;
      font-weight: 500;
      color: #5a7ec9;
      letter-spacing: .2px;
    }
    .is-placeholder-hint {
      font-family: 'Google Sans', 'Segoe UI', sans-serif;
      font-size: 10px;
      color: #8ab0f5;
      letter-spacing: .1px;
    }

    /* ─── Blur mode ─── */
    .is-blurred {
      filter: blur(var(--is-blur, 18px)) !important;
      transition: filter var(--is-transition) !important;
      cursor: pointer !important;
      border-radius: var(--is-radius-sm) !important;
    }
    .is-blurred:hover {
      filter: blur(calc(var(--is-blur, 18px) * .5)) !important;
    }

    /* ─── Float Button ─── */
    #is-fab {
      position: fixed;
      right: 18px;
      bottom: 64px;
      z-index: 99999;
      width: 44px;
      height: 44px;
      background: var(--is-primary);
      color: #fff;
      border: none;
      border-radius: var(--is-radius-full);
      font-size: 20px;
      font-family: monospace;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(26,115,232,.4);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all var(--is-transition);
      user-select: none;
    }
    #is-fab:hover {
      background: #1557b0;
      box-shadow: 0 6px 20px rgba(26,115,232,.5);
      transform: scale(1.06);
    }
    #is-fab:active { transform: scale(.95); }

    /* ─── Badge ─── */
    #is-badge {
      position: absolute;
      top: -5px;
      right: -5px;
      background: var(--is-error);
      color: #fff;
      border-radius: var(--is-radius-full);
      font-size: 9px;
      font-weight: 700;
      font-family: 'Google Sans', sans-serif;
      min-width: 17px;
      height: 17px;
      padding: 0 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }

    /* ─── Panel ─── */
    #is-panel {
      position: fixed;
      right: 18px;
      bottom: 118px;
      z-index: 99998;
      width: 320px;
      background: var(--is-surface);
      border-radius: 16px;
      box-shadow: 0 8px 32px var(--is-shadow-lg), 0 2px 8px var(--is-shadow);
      overflow: hidden;
      transform-origin: bottom right;
      transform: scale(.9) translateY(10px);
      opacity: 0;
      pointer-events: none;
      transition: all .22s cubic-bezier(.4,0,.2,1);
    }
    #is-panel.is-open {
      transform: scale(1) translateY(0);
      opacity: 1;
      pointer-events: all;
    }

    .is-panel-header {
      background: linear-gradient(135deg, #1a73e8 0%, #1557b0 100%);
      padding: 16px 18px 14px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .is-panel-header-icon {
      width: 20px;
      height: 20px;
      color: rgba(255,255,255,.9);
      flex-shrink: 0;
    }
    .is-panel-title {
      font-family: 'Google Sans', 'Segoe UI', sans-serif;
      font-size: 15px;
      font-weight: 600;
      color: #fff;
      flex: 1;
    }
    .is-panel-subtitle {
      font-family: 'Google Sans', sans-serif;
      font-size: 11px;
      color: rgba(255,255,255,.75);
      margin-top: 2px;
    }
    .is-panel-close {
      background: rgba(255,255,255,.18);
      border: none;
      color: #fff;
      width: 28px;
      height: 28px;
      border-radius: var(--is-radius-full);
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background var(--is-transition);
    }
    .is-panel-close:hover { background: rgba(255,255,255,.3); }

    .is-panel-body {
      padding: 0;
      max-height: 480px;
      overflow-y: auto;
    }

    .is-section {
      padding: 14px 18px 10px;
      border-bottom: 1px solid var(--is-outline-soft);
    }
    .is-section:last-child { border-bottom: none; }
    .is-section-label {
      font-family: 'Google Sans', sans-serif;
      font-size: 10px;
      font-weight: 600;
      color: var(--is-primary);
      letter-spacing: .8px;
      text-transform: uppercase;
      margin-bottom: 10px;
    }

    /* Row */
    .is-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 7px 0;
    }
    .is-row-label {
      font-family: 'Google Sans', sans-serif;
      font-size: 13.5px;
      color: var(--is-text);
    }
    .is-row-desc {
      font-size: 11px;
      color: var(--is-text-secondary);
      margin-top: 1px;
    }

    /* MD3 Switch */
    .is-switch {
      position: relative;
      width: 46px;
      height: 26px;
      flex-shrink: 0;
    }
    .is-switch input { opacity: 0; width: 0; height: 0; }
    .is-switch-track {
      position: absolute;
      inset: 0;
      background: #e0e0e0;
      border-radius: 13px;
      cursor: pointer;
      transition: background var(--is-transition);
    }
    .is-switch input:checked + .is-switch-track { background: var(--is-primary); }
    .is-switch-track::after {
      content: '';
      position: absolute;
      width: 20px;
      height: 20px;
      background: #fff;
      border-radius: 50%;
      top: 3px;
      left: 3px;
      box-shadow: 0 1px 4px rgba(0,0,0,.2);
      transition: transform var(--is-transition);
    }
    .is-switch input:checked + .is-switch-track::after { transform: translateX(20px); }

    /* Segment Control */
    .is-segment {
      display: flex;
      background: var(--is-outline-soft);
      border-radius: var(--is-radius-sm);
      padding: 3px;
      gap: 2px;
    }
    .is-segment-btn {
      flex: 1;
      border: none;
      background: transparent;
      font-family: 'Google Sans', sans-serif;
      font-size: 11.5px;
      color: var(--is-text-secondary);
      padding: 5px 6px;
      border-radius: 6px;
      cursor: pointer;
      transition: all var(--is-transition);
      white-space: nowrap;
    }
    .is-segment-btn.active {
      background: var(--is-surface);
      color: var(--is-primary);
      font-weight: 600;
      box-shadow: 0 1px 4px var(--is-shadow);
    }

    /* Slider */
    .is-slider-wrap { padding: 4px 0 6px; }
    .is-slider {
      -webkit-appearance: none;
      width: 100%;
      height: 4px;
      border-radius: 2px;
      background: var(--is-outline-soft);
      outline: none;
      cursor: pointer;
    }
    .is-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--is-primary);
      box-shadow: 0 1px 4px rgba(26,115,232,.4);
      cursor: pointer;
    }

    /* Danger Button */
    .is-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: none;
      border-radius: var(--is-radius-full);
      font-family: 'Google Sans', sans-serif;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      padding: 8px 16px;
      transition: all var(--is-transition);
    }
    .is-btn-tonal {
      background: var(--is-primary-light);
      color: var(--is-primary);
    }
    .is-btn-tonal:hover { background: #d2e3fc; box-shadow: 0 1px 4px var(--is-shadow); }
    .is-btn-danger {
      background: #fce8e6;
      color: var(--is-error);
    }
    .is-btn-danger:hover { background: #f5c6c2; }

    /* Stats chip */
    .is-stat {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--is-primary-light);
      color: var(--is-primary);
      border-radius: var(--is-radius-full);
      font-family: 'Google Sans', sans-serif;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 12px;
    }

    /* ─── Toast / Snackbar ─── */
    #is-toast-container {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 999999;
      display: flex;
      flex-direction: column-reverse;
      align-items: center;
      gap: 8px;
      pointer-events: none;
    }
    .is-toast {
      background: #202124;
      color: #fff;
      font-family: 'Google Sans', 'Segoe UI', sans-serif;
      font-size: 13px;
      padding: 10px 20px;
      border-radius: var(--is-radius-full);
      box-shadow: 0 4px 16px rgba(0,0,0,.3);
      animation: is-toast-in .25s cubic-bezier(.4,0,.2,1) forwards;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .is-toast.is-toast-out {
      animation: is-toast-out .2s cubic-bezier(.4,0,.2,1) forwards;
    }
    @keyframes is-toast-in {
      from { opacity: 0; transform: translateY(12px) scale(.95); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes is-toast-out {
      from { opacity: 1; transform: translateY(0) scale(1); }
      to   { opacity: 0; transform: translateY(8px) scale(.95); }
    }
  `;
  document.head.appendChild(style);

  // ─────────────────────────────────────────────
  //  TOAST
  // ─────────────────────────────────────────────
  const toastContainer = document.createElement('div');
  toastContainer.id = 'is-toast-container';
  document.body.appendChild(toastContainer);

  function showToast(msg, icon = '✓') {
    const t = document.createElement('div');
    t.className = 'is-toast';
    t.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
    toastContainer.appendChild(t);
    setTimeout(() => {
      t.classList.add('is-toast-out');
      setTimeout(() => t.remove(), 250);
    }, 3000);
  }

  // ─────────────────────────────────────────────
  //  UNIQUE ID FOR EACH IMG
  // ─────────────────────────────────────────────
  let _idCounter = 0;
  function getImgId(img) {
    if (!img.dataset.isId) img.dataset.isId = 'is_' + (++_idCounter);
    return img.dataset.isId;
  }

  // ─────────────────────────────────────────────
  //  DETECT "MINE vs OTHERS"
  // ─────────────────────────────────────────────
  function isMine(img) {
    // Discord marks your own messages with specific wrapper classes
    let el = img.parentElement;
    for (let i = 0; i < 8; i++) {
      if (!el) break;
      // repliedMessage or mentioned → others
      if (el.getAttribute && el.getAttribute('aria-roledescription') === 'Message') {
        // Check for "isSending" or author-is-self cues — Discord uses class suffix patterns
        const cls = el.className || '';
        // "groupStart" + no "hasReply" and "mentioned" ≈ heuristic for mine
        // More reliable: check if the message content has no avatar (own msgs in compact mode)
        // We'll use the wrapper: own messages often lack avatar image as child of contents
        const contents = el.querySelector('[class*="contents_"]');
        if (contents) {
          const hasAvatar = contents.querySelector('[class*="avatar_"]');
          return !hasAvatar;
        }
        return false;
      }
      el = el.parentElement;
    }
    return false;
  }

  // ─────────────────────────────────────────────
  //  SHOULD THIS IMG BE BLOCKED?
  // ─────────────────────────────────────────────
  function shouldBlock(img) {
    if (!settings.enabled) return false;

    const src = img.src || '';
    if (!src || src.startsWith('data:')) return false;

    // Skip avatars, emojis, icons, stickers
    const skipPatterns = [
      /avatars\//, /emojis\//, /icons\//, /stickers\//,
      /clan-badges\//, /profile-effects\//, /role-icons\//,
      /favicon/, /logo/,
      /assets\//,
    ];
    if (skipPatterns.some(p => p.test(src))) return false;

    // Must be in the messages list (chat area)
    const inMessages = img.closest('[data-list-id="chat-messages"]') ||
                       img.closest('[class*="messageListItem"]') ||
                       img.closest('[class*="visualMedia"]') ||
                       img.closest('[class*="embedImage"]') ||
                       img.closest('[class*="imageContent"]');
    if (!inMessages) return false;

    // Mode filtering
    if (settings.mode === 'mine' && !isMine(img)) return false;
    if (settings.mode === 'others' && isMine(img)) return false;

    return true;
  }

  // ─────────────────────────────────────────────
  //  BLOCK / UNBLOCK
  // ─────────────────────────────────────────────
  function blockImg(img) {
    if (img.dataset.isBlocked === '1') return;
    const id = getImgId(img);
    if (settings.unlockedIds[id]) return; // user previously unlocked it

    img.dataset.isBlocked = '1';

    if (settings.style === 'blur') {
      img.classList.add('is-blurred');
      img.style.setProperty('--is-blur', settings.blurAmount + 'px');
      img.addEventListener('click', onBlurClick, { once: true });
    } else {
      // Placeholder
      const originalSrc = img.src;
      img.dataset.isOriginalSrc = originalSrc;

      const wrapper = document.createElement('div');
      wrapper.className = 'is-placeholder';
      wrapper.dataset.isPlaceholder = '1';
      wrapper.dataset.isForId = id;

      // Compute a reasonable size from the img's natural dimensions if available
      const w = img.naturalWidth || img.width || 200;
      const h = img.naturalHeight || img.height || 120;
      const ratio = Math.min(420 / w, 280 / h, 1);
      wrapper.style.width = Math.round(w * ratio) + 'px';
      wrapper.style.height = Math.round(h * ratio) + 'px';

      wrapper.innerHTML = `
        <div class="is-placeholder-inner">
          <svg class="is-placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="3"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <path d="M21 15l-5-5L5 21"/>
          </svg>
          <span class="is-placeholder-label">图片已隐藏</span>
          <span class="is-placeholder-hint">点击查看</span>
        </div>
      `;
      wrapper.addEventListener('click', () => onPlaceholderClick(wrapper, img, id));

      img.style.display = 'none';
      img.parentNode.insertBefore(wrapper, img);
    }

    blockedCount++;
    updateBadge();
  }

  function onBlurClick(e) {
    const img = e.currentTarget;
    const id = getImgId(img);
    img.classList.remove('is-blurred');
    img.dataset.isBlocked = '0';
    settings.unlockedIds[id] = true;
    saveSettings();
    showToast('图片已解锁', '🔓');
  }

  function onPlaceholderClick(wrapper, img, id) {
    // Reveal the image
    img.style.display = '';
    wrapper.remove();
    img.dataset.isBlocked = '0';
    settings.unlockedIds[id] = true;
    saveSettings();
    showToast('图片已解锁', '🔓');

    // Allow re-hiding by clicking the image again
    img.style.cursor = 'pointer';
    img.title = '点击重新隐藏';
    img.addEventListener('click', () => rehideImg(img, id), { once: true });
  }

  function rehideImg(img, id) {
    delete settings.unlockedIds[id];
    img.dataset.isBlocked = '0';
    saveSettings();
    blockImg(img);
    showToast('图片已重新隐藏', '🙈');
  }

  // ─────────────────────────────────────────────
  //  PROCESS NODES
  // ─────────────────────────────────────────────
  function processImages(root) {
    const imgs = root.querySelectorAll ? root.querySelectorAll('img') : [];
    imgs.forEach(img => {
      if (img.complete && img.naturalWidth > 0) {
        if (shouldBlock(img)) blockImg(img);
      } else {
        img.addEventListener('load', () => {
          if (shouldBlock(img)) blockImg(img);
        }, { once: true });
      }
    });
  }

  // ─────────────────────────────────────────────
  //  MUTATION OBSERVER
  // ─────────────────────────────────────────────
  const observer = new MutationObserver(mutations => {
    if (!settings.enabled) return;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === 'IMG') {
          if (node.complete) { if (shouldBlock(node)) blockImg(node); }
          else node.addEventListener('load', () => { if (shouldBlock(node)) blockImg(node); }, { once: true });
        } else {
          processImages(node);
        }
      }
    }
  });

  function startObserver() {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ─────────────────────────────────────────────
  //  RE-APPLY (settings changed)
  // ─────────────────────────────────────────────
  function reapplyAll() {
    // Remove existing placeholders & blur
    document.querySelectorAll('.is-placeholder').forEach(p => {
      const img = p.nextSibling;
      if (img && img.tagName === 'IMG') img.style.display = '';
      p.remove();
    });
    document.querySelectorAll('.is-blurred').forEach(img => {
      img.classList.remove('is-blurred');
      img.dataset.isBlocked = '0';
    });
    document.querySelectorAll('[data-is-blocked]').forEach(img => {
      img.dataset.isBlocked = '0';
    });
    blockedCount = 0;
    updateBadge();
    if (settings.enabled) processImages(document.body);
  }

  // ─────────────────────────────────────────────
  //  FAB BUTTON
  // ─────────────────────────────────────────────
  const fab = document.createElement('button');
  fab.id = 'is-fab';
  fab.title = 'Image Shield';
  fab.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <line x1="9" y1="12" x2="15" y2="12"/>
    </svg>
    <span id="is-badge" style="display:none">0</span>
  `;
  document.body.appendChild(fab);

  function updateBadge() {
    const badge = document.getElementById('is-badge');
    if (!badge) return;
    if (blockedCount > 0 && settings.enabled) {
      badge.style.display = 'flex';
      badge.textContent = blockedCount > 99 ? '99+' : blockedCount;
    } else {
      badge.style.display = 'none';
    }
  }

  // ─────────────────────────────────────────────
  //  PANEL
  // ─────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.id = 'is-panel';
  panel.innerHTML = `
    <div class="is-panel-header">
      <svg class="is-panel-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      <div>
        <div class="is-panel-title">Image Shield</div>
        <div class="is-panel-subtitle">Discord 图片安全拦截器</div>
      </div>
      <button class="is-panel-close" id="is-panel-close">✕</button>
    </div>

    <div class="is-panel-body">
      <!-- 主开关 -->
      <div class="is-section">
        <div class="is-section-label">总控制</div>
        <div class="is-row">
          <div>
            <div class="is-row-label">启用拦截</div>
            <div class="is-row-desc">全局开关</div>
          </div>
          <label class="is-switch">
            <input type="checkbox" id="is-toggle-enabled">
            <span class="is-switch-track"></span>
          </label>
        </div>
        <div class="is-row" style="padding-top:4px;">
          <span class="is-stat" id="is-stat-count">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
            <span>已拦截 0 张</span>
          </span>
        </div>
      </div>

      <!-- 拦截范围 -->
      <div class="is-section">
        <div class="is-section-label">拦截范围</div>
        <div class="is-segment" id="is-mode-seg">
          <button class="is-segment-btn" data-mode="all">全部</button>
          <button class="is-segment-btn" data-mode="others">仅对方</button>
          <button class="is-segment-btn" data-mode="mine">仅自己</button>
        </div>
      </div>

      <!-- 显示方式 -->
      <div class="is-section">
        <div class="is-section-label">显示方式</div>
        <div class="is-segment" id="is-style-seg">
          <button class="is-segment-btn" data-style="placeholder">占位符</button>
          <button class="is-segment-btn" data-style="blur">模糊处理</button>
        </div>

        <!-- Blur slider -->
        <div id="is-blur-section" style="display:none; margin-top:10px;">
          <div class="is-row">
            <div class="is-row-label">模糊强度</div>
            <span id="is-blur-val" style="font-family:'Google Sans',sans-serif;font-size:12px;color:var(--is-primary)">18px</span>
          </div>
          <div class="is-slider-wrap">
            <input type="range" class="is-slider" id="is-blur-slider" min="4" max="40" step="2" value="18">
          </div>
        </div>
      </div>

      <!-- 操作 -->
      <div class="is-section" style="display:flex;gap:8px;flex-wrap:wrap;padding-bottom:14px;">
        <button class="is-btn is-btn-tonal" id="is-btn-reapply">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.7"/></svg>
          重新扫描
        </button>
        <button class="is-btn is-btn-danger" id="is-btn-reset">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          重置解锁记录
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  // ─── Wire up panel controls ───
  function syncPanelUI() {
    const tog = document.getElementById('is-toggle-enabled');
    if (tog) tog.checked = settings.enabled;

    document.querySelectorAll('#is-mode-seg .is-segment-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === settings.mode);
    });
    document.querySelectorAll('#is-style-seg .is-segment-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.style === settings.style);
    });

    const blurSec = document.getElementById('is-blur-section');
    if (blurSec) blurSec.style.display = settings.style === 'blur' ? 'block' : 'none';

    const slider = document.getElementById('is-blur-slider');
    if (slider) {
      slider.value = settings.blurAmount;
      document.getElementById('is-blur-val').textContent = settings.blurAmount + 'px';
    }

    updateStatChip();
  }

  function updateStatChip() {
    const el = document.querySelector('#is-stat-count span:last-child');
    if (el) el.textContent = `已拦截 ${blockedCount} 张`;
  }

  // Toggle enabled
  document.getElementById('is-toggle-enabled').addEventListener('change', e => {
    settings.enabled = e.target.checked;
    saveSettings();
    reapplyAll();
    showToast(settings.enabled ? '拦截已启用 🛡️' : '拦截已关闭', settings.enabled ? '🛡️' : '👁️');
    updateBadge();
  });

  // Mode
  document.getElementById('is-mode-seg').addEventListener('click', e => {
    const btn = e.target.closest('.is-segment-btn');
    if (!btn) return;
    settings.mode = btn.dataset.mode;
    saveSettings();
    document.querySelectorAll('#is-mode-seg .is-segment-btn').forEach(b =>
      b.classList.toggle('active', b === btn));
    reapplyAll();
    showToast('拦截范围已更新', '✓');
  });

  // Style
  document.getElementById('is-style-seg').addEventListener('click', e => {
    const btn = e.target.closest('.is-segment-btn');
    if (!btn) return;
    settings.style = btn.dataset.style;
    saveSettings();
    document.querySelectorAll('#is-style-seg .is-segment-btn').forEach(b =>
      b.classList.toggle('active', b === btn));
    const blurSec = document.getElementById('is-blur-section');
    if (blurSec) blurSec.style.display = settings.style === 'blur' ? 'block' : 'none';
    reapplyAll();
    showToast(settings.style === 'blur' ? '模式：模糊处理' : '模式：占位符替换', '✓');
  });

  // Blur slider
  document.getElementById('is-blur-slider').addEventListener('input', e => {
    settings.blurAmount = +e.target.value;
    document.getElementById('is-blur-val').textContent = settings.blurAmount + 'px';
    document.querySelectorAll('.is-blurred').forEach(img => {
      img.style.setProperty('--is-blur', settings.blurAmount + 'px');
    });
    saveSettings();
  });

  // Reapply
  document.getElementById('is-btn-reapply').addEventListener('click', () => {
    reapplyAll();
    showToast('已重新扫描页面', '🔍');
  });

  // Reset unlocks
  document.getElementById('is-btn-reset').addEventListener('click', () => {
    settings.unlockedIds = {};
    saveSettings();
    reapplyAll();
    showToast('所有解锁记录已清除', '🔒');
  });

  // Close panel
  document.getElementById('is-panel-close').addEventListener('click', () => {
    panel.classList.remove('is-open');
  });

  // FAB toggle
  fab.addEventListener('click', () => {
    const open = panel.classList.toggle('is-open');
    if (open) {
      syncPanelUI();
      updateStatChip();
    }
  });

  // Close on outside click
  document.addEventListener('click', e => {
    if (!panel.contains(e.target) && e.target !== fab && !fab.contains(e.target)) {
      panel.classList.remove('is-open');
    }
  });

  // ─────────────────────────────────────────────
  //  INIT
  // ─────────────────────────────────────────────
  function init() {
    syncPanelUI();
    startObserver();
    if (settings.enabled) {
      processImages(document.body);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Discord SPA — wait a tick for React to hydrate
    setTimeout(init, 800);
  }

  // Periodically re-scan for new content (Discord SPA route changes)
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      blockedCount = 0;
      updateBadge();
      setTimeout(() => {
        if (settings.enabled) processImages(document.body);
      }, 1200);
    }
    // Also update stat chip if panel is open
    if (panel.classList.contains('is-open')) updateStatChip();
  }, 1500);

})();