// ==UserScript==
// @name         JackYun Portal Companion
// @namespace    https://jackyun.top/
// @version      1.1.0
// @description  Google 风格学习助手：有效使用时间、每日/七日报告、目标、专注计时与本地备份。
// @author       JackYun
// @license      MIT
// @match        https://jackyun.top/*
// @match        https://jackyun.cn/*
// @match        https://yunfanshi.github.io/*
// @match        https://bestexamhelp.com/*
// @match        https://znotes.org/*
// @match        https://pastpapers.papacambridge.com/*
// @match        https://revisiontown.com/*
// @match        https://www.savemyexams.com/*
// @match        https://www.physicsandmathstutor.com/*
// @match        https://www.cambridgeinternational.org/*
// @match        https://qualifications.pearson.com/*
// @match        https://ielts.org/*
// @match        https://www.chinaielts.org/*
// @match        https://chatgpt.com/*
// @match        https://claude.ai/*
// @match        https://gemini.google.com/*
// @match        https://chat.deepseek.com/*
// @match        https://chat.qwen.ai/*
// @match        https://www.perplexity.ai/*
// @match        https://notebooklm.google.com/*
// @match        https://www.khanacademy.org/*
// @match        https://www.wolframalpha.com/*
// @match        https://www.geogebra.org/*
// @match        https://phet.colorado.edu/*
// @match        https://www.youtube.com/*
// @match        https://www.luogu.com.cn/*
// @match        https://www.w3schools.com/*
// @match        https://www.freecodecamp.org/*
// @match        https://ocw.mit.edu/*
// @match        https://www.edx.org/*
// @match        https://www.coursera.org/*
// @match        https://www.bbc.co.uk/learningenglish/*
// @match        https://dictionary.cambridge.org/*
// @match        https://youglish.com/*
// @match        https://ankiweb.net/*
// @match        https://scholar.google.com/*
// @match        https://arxiv.org/*
// @match        https://en.wikipedia.org/*
// @match        https://zh.wikipedia.org/*
// @match        https://archive.org/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEY = 'jyc-data-v1';
  const HEARTBEAT_MS = 5000;
  const MAX_DAYS = 90;
  const host = location.hostname.replace(/^www\./, '');
  const isPortal = /(^|\.)jackyun\.top$|^yunfanshi\.github\.io$/.test(host);
  const CATEGORY_RULES = [
    ['AI 助手', /chatgpt|claude\.ai|gemini\.google|deepseek|qwen|perplexity|notebooklm/],
    ['考试资料', /bestexamhelp|znotes|papacambridge|revisiontown|savemyexams|physicsandmathstutor|cambridgeinternational|pearson|ielts/],
    ['编程学习', /luogu|w3schools|freecodecamp|ocw\.mit|github/],
    ['课程平台', /khanacademy|edx|coursera|youtube/],
    ['语言学习', /bbc\.co\.uk|dictionary\.cambridge|youglish|ankiweb/],
    ['数理工具', /wolframalpha|geogebra|phet\.colorado/],
    ['研究阅读', /scholar\.google|arxiv|wikipedia|archive\.org/],
    ['JackYun', /jackyun\.top|yunfanshi\.github\.io/],
  ];
  const category = (CATEGORY_RULES.find(([, rule]) => rule.test(host)) || ['其他学习']) [0];
  const nowIsoDay = () => new Date().toLocaleDateString('en-CA');
  const defaultData = () => ({
    version: 1,
    settings: { enabled: true, showFab: true, goalMinutes: 120, idleSeconds: 60, countAI: true },
    daily: {},
    focus: { running: false, endsAt: 0, duration: 25 },
  });

  function loadData() {
    try {
      const saved = GM_getValue(STORAGE_KEY, null);
      const value = typeof saved === 'string' ? JSON.parse(saved) : saved;
      const base = defaultData();
      if (!value || typeof value !== 'object') return base;
      return {
        ...base,
        ...value,
        settings: { ...base.settings, ...(value.settings || {}) },
        daily: value.daily && typeof value.daily === 'object' ? value.daily : {},
        focus: { ...base.focus, ...(value.focus || {}) },
      };
    } catch {
      return defaultData();
    }
  }

  let data = loadData();
  let lastInteraction = Date.now();
  let lastHeartbeat = Date.now();
  let panelOpen = false;
  let toastTimer = 0;

  function saveData() {
    const days = Object.keys(data.daily).sort();
    days.slice(0, Math.max(0, days.length - MAX_DAYS)).forEach((day) => delete data.daily[day]);
    GM_setValue(STORAGE_KEY, data);
  }

  function dayRecord(day = nowIsoDay()) {
    if (!data.daily[day]) data.daily[day] = { total: 0, sites: {}, categories: {} };
    return data.daily[day];
  }

  function shouldTrack() {
    if (!data.settings.enabled || document.hidden || !document.hasFocus()) return false;
    if (category === 'AI 助手' && !data.settings.countAI) return false;
    return Date.now() - lastInteraction <= Number(data.settings.idleSeconds) * 1000;
  }

  function heartbeat() {
    const current = Date.now();
    const elapsed = Math.min(HEARTBEAT_MS, current - lastHeartbeat);
    lastHeartbeat = current;
    if (shouldTrack() && elapsed > 0) {
      const seconds = elapsed / 1000;
      const record = dayRecord();
      record.total += seconds;
      record.sites[host] = (record.sites[host] || 0) + seconds;
      record.categories[category] = (record.categories[category] || 0) + seconds;
      saveData();
    }
    updateLiveUI();
  }

  ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'].forEach((eventName) => {
    window.addEventListener(eventName, () => { lastInteraction = Date.now(); }, { passive: true, capture: true });
  });
  window.addEventListener('focus', () => { lastInteraction = Date.now(); lastHeartbeat = Date.now(); });
  document.addEventListener('visibilitychange', () => { lastHeartbeat = Date.now(); });

  const style = document.createElement('style');
  style.textContent = `
    #jyc-root{--jyc-blue:#1a73e8;--jyc-green:#34a853;--jyc-yellow:#fbbc04;--jyc-red:#ea4335;--jyc-text:#202124;--jyc-muted:#5f6368;--jyc-surface:#fff;--jyc-border:#dadce0;font:14px/1.45 Arial,"Noto Sans SC",sans-serif;color:var(--jyc-text);position:fixed;z-index:2147483646}
    #jyc-fab{position:fixed;right:22px;bottom:22px;min-width:58px;height:58px;border:0;border-radius:18px;background:var(--jyc-blue);color:#fff;box-shadow:0 4px 16px #1a73e855;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;padding:0 16px;font:600 13px Arial;transition:.2s transform,.2s box-shadow}
    #jyc-fab:hover{transform:translateY(-2px);box-shadow:0 7px 24px #1a73e866}#jyc-fab:focus-visible,.jyc-btn:focus-visible{outline:3px solid #aecbfa;outline-offset:2px}
    #jyc-panel{position:fixed;right:22px;bottom:92px;width:min(390px,calc(100vw - 24px));max-height:min(720px,calc(100vh - 116px));overflow:auto;background:var(--jyc-surface);border:1px solid var(--jyc-border);border-radius:24px;box-shadow:0 12px 40px #3c404355;display:none}
    #jyc-panel.jyc-open{display:block;animation:jyc-in .18s ease-out}@keyframes jyc-in{from{opacity:0;transform:translateY(8px) scale(.98)}}
    .jyc-head{padding:20px;background:linear-gradient(135deg,#1a73e8,#4285f4);color:#fff;border-radius:23px 23px 0 0}.jyc-headrow,.jyc-row{display:flex;align-items:center;justify-content:space-between;gap:12px}.jyc-title{font-size:20px;font-weight:700}.jyc-sub{opacity:.85;font-size:12px;margin-top:3px}
    .jyc-close{border:0;background:#ffffff25;color:#fff;border-radius:50%;width:34px;height:34px;cursor:pointer;font-size:20px}.jyc-body{padding:16px}.jyc-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.jyc-card{border:1px solid var(--jyc-border);border-radius:16px;padding:13px;background:var(--jyc-surface)}.jyc-kicker{font-size:11px;color:var(--jyc-muted);text-transform:uppercase;letter-spacing:.06em}.jyc-value{font-size:22px;font-weight:700;margin-top:4px}.jyc-value small{font-size:12px;font-weight:400;color:var(--jyc-muted)}
    .jyc-progress{height:8px;background:#e8eaed;border-radius:99px;overflow:hidden;margin-top:10px}.jyc-progress>i{height:100%;display:block;background:var(--jyc-green);border-radius:inherit}.jyc-section{margin-top:18px}.jyc-section h3{font-size:14px;margin:0 0 9px}.jyc-list{display:grid;gap:8px}.jyc-site{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center}.jyc-site-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.jyc-time{font-variant-numeric:tabular-nums;color:var(--jyc-muted);font-size:12px}
    .jyc-bars{display:flex;height:70px;align-items:end;gap:6px}.jyc-bar{flex:1;min-width:0;text-align:center;color:var(--jyc-muted);font-size:9px}.jyc-bar i{display:block;background:#aecbfa;border-radius:5px 5px 2px 2px;min-height:3px;margin-bottom:4px}.jyc-bar.today i{background:var(--jyc-blue)}
    .jyc-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.jyc-btn{border:1px solid var(--jyc-border);background:var(--jyc-surface);color:var(--jyc-blue);border-radius:12px;min-height:40px;padding:8px 10px;font-weight:600;cursor:pointer}.jyc-btn.primary{background:var(--jyc-blue);border-color:var(--jyc-blue);color:#fff}.jyc-btn.danger{color:var(--jyc-red)}
    .jyc-field{display:grid;grid-template-columns:1fr 92px;gap:10px;align-items:center;margin-top:10px}.jyc-field label{color:var(--jyc-muted)}.jyc-field input,.jyc-field select{width:100%;box-sizing:border-box;border:1px solid var(--jyc-border);border-radius:9px;padding:8px;background:var(--jyc-surface);color:var(--jyc-text)}.jyc-check{display:flex;gap:8px;align-items:center;margin-top:10px;color:var(--jyc-muted)}
    .jyc-privacy{margin-top:14px;padding:11px;border-radius:12px;background:#e8f0fe;color:#174ea6;font-size:11px}.jyc-toast{position:fixed;right:22px;bottom:92px;background:#303134;color:#fff;padding:11px 16px;border-radius:10px;box-shadow:0 5px 18px #0005;display:none}.jyc-toast.show{display:block;animation:jyc-in .18s ease-out}
    .jyc-time-badge{display:inline-flex!important;align-items:center;margin-left:6px;padding:2px 7px;border-radius:999px;background:#e8f0fe;color:#1967d2;font:600 10px Arial!important;vertical-align:middle}
    @media(prefers-color-scheme:dark){#jyc-root{--jyc-text:#e8eaed;--jyc-muted:#9aa0a6;--jyc-surface:#202124;--jyc-border:#3c4043}.jyc-progress{background:#3c4043}.jyc-privacy{background:#174ea655;color:#d2e3fc}.jyc-time-badge{background:#174ea6;color:#d2e3fc}}
    @media(max-width:520px){#jyc-panel{right:12px;bottom:82px}#jyc-fab{right:12px;bottom:12px}.jyc-toast{right:12px;bottom:82px}}
  `;
  document.documentElement.appendChild(style);

  const root = document.createElement('div');
  root.id = 'jyc-root';
  root.innerHTML = `
    <button id="jyc-fab" type="button" aria-label="打开 JackYun 学习助手"><span>JY</span><b id="jyc-fab-time">0m</b></button>
    <section id="jyc-panel" role="dialog" aria-modal="false" aria-label="JackYun 学习助手">
      <header class="jyc-head"><div class="jyc-headrow"><div><div class="jyc-title">JackYun 学习助手</div><div class="jyc-sub" id="jyc-status">正在准备统计…</div></div><button class="jyc-close" id="jyc-close" type="button" aria-label="关闭">×</button></div></header>
      <div class="jyc-body">
        <div class="jyc-grid"><div class="jyc-card"><div class="jyc-kicker">今日有效学习</div><div class="jyc-value" id="jyc-today">0 分钟</div><div class="jyc-progress"><i id="jyc-goal-bar"></i></div></div><div class="jyc-card"><div class="jyc-kicker">当前网站</div><div class="jyc-value" id="jyc-current">0 <small>分钟</small></div><div class="jyc-sub" id="jyc-category"></div></div></div>
        <div class="jyc-section"><h3>今日网站排行</h3><div class="jyc-list" id="jyc-sites"></div></div>
        <div class="jyc-section"><h3>最近 7 天</h3><div class="jyc-bars" id="jyc-week"></div></div>
        <div class="jyc-section"><h3>专注计时</h3><div class="jyc-actions"><button class="jyc-btn primary" id="jyc-focus-25" type="button">开始 25 分钟</button><button class="jyc-btn" id="jyc-focus-50" type="button">开始 50 分钟</button><button class="jyc-btn danger" id="jyc-focus-stop" type="button">结束计时</button><button class="jyc-btn" id="jyc-notify" type="button">测试提示</button></div></div>
        <div class="jyc-section"><h3>设置与数据</h3><div class="jyc-field"><label for="jyc-goal">每日目标（分钟）</label><input id="jyc-goal" type="number" min="10" max="1440" step="10"></div><div class="jyc-field"><label for="jyc-idle">无操作后暂停</label><select id="jyc-idle"><option value="30">30 秒</option><option value="60">60 秒</option><option value="120">2 分钟</option><option value="300">5 分钟</option></select></div><label class="jyc-check"><input id="jyc-enabled" type="checkbox">启用时间统计</label><label class="jyc-check"><input id="jyc-count-ai" type="checkbox">把 AI 网站计入学习时间</label><div class="jyc-actions" style="margin-top:12px"><button class="jyc-btn" id="jyc-export" type="button">导出 JSON</button><button class="jyc-btn" id="jyc-import" type="button">导入备份</button><button class="jyc-btn danger" id="jyc-reset" type="button">清除统计</button><button class="jyc-btn" id="jyc-hide-fab" type="button">隐藏悬浮按钮</button></div><input id="jyc-file" type="file" accept="application/json" hidden></div>
        <div class="jyc-privacy"><strong>Companion Lite</strong>：所有统计仅保存在 Tampermonkey 本地，不读取正文或输入内容。需要账号登录、多设备同步、稍后学习和设备管理时，请前往 <a href="https://jackyun.top/settings?section=companion" target="_blank" rel="noopener noreferrer" style="color:inherit;font-weight:bold">JackYun Portal 安装正式扩展</a>。</div>
      </div>
    </section><div class="jyc-toast" id="jyc-toast" role="status"></div>`;
  document.body.appendChild(root);

  const $ = (selector) => root.querySelector(selector);
  const fab = $('#jyc-fab');
  const panel = $('#jyc-panel');
  const formatMinutes = (seconds) => Math.max(0, Math.round(Number(seconds || 0) / 60));
  const shortTime = (seconds) => {
    const minutes = formatMinutes(seconds);
    return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
  };
  const safeText = (value) => String(value || '').replace(/^www\./, '');

  function togglePanel(force) {
    panelOpen = typeof force === 'boolean' ? force : !panelOpen;
    panel.classList.toggle('jyc-open', panelOpen);
    fab.setAttribute('aria-expanded', String(panelOpen));
    if (panelOpen) render();
  }

  function toast(message) {
    const node = $('#jyc-toast');
    node.textContent = message;
    node.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => node.classList.remove('show'), 2400);
  }

  function lastDays(count) {
    return Array.from({ length: count }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (count - 1 - index));
      return date.toLocaleDateString('en-CA');
    });
  }

  function renderSites(record) {
    const target = $('#jyc-sites');
    target.replaceChildren();
    const sites = Object.entries(record.sites || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (!sites.length) {
      const empty = document.createElement('div');
      empty.className = 'jyc-sub';
      empty.textContent = '今天还没有有效学习记录。';
      target.appendChild(empty);
      return;
    }
    sites.forEach(([site, seconds]) => {
      const row = document.createElement('div');
      row.className = 'jyc-site';
      const name = document.createElement('span');
      name.className = 'jyc-site-name';
      name.textContent = safeText(site);
      const time = document.createElement('span');
      time.className = 'jyc-time';
      time.textContent = shortTime(seconds);
      row.append(name, time);
      target.appendChild(row);
    });
  }

  function renderWeek() {
    const target = $('#jyc-week');
    target.replaceChildren();
    const days = lastDays(7);
    const maximum = Math.max(1, ...days.map((day) => data.daily[day]?.total || 0));
    days.forEach((day) => {
      const item = document.createElement('div');
      item.className = `jyc-bar${day === nowIsoDay() ? ' today' : ''}`;
      const bar = document.createElement('i');
      bar.style.height = `${Math.max(3, ((data.daily[day]?.total || 0) / maximum) * 58)}px`;
      bar.title = `${day}: ${shortTime(data.daily[day]?.total || 0)}`;
      const label = document.createElement('span');
      label.textContent = day.slice(5).replace('-', '/');
      item.append(bar, label);
      target.appendChild(item);
    });
  }

  function render() {
    const record = dayRecord();
    const siteSeconds = record.sites[host] || 0;
    const goalSeconds = Math.max(10, Number(data.settings.goalMinutes)) * 60;
    $('#jyc-today').textContent = `${formatMinutes(record.total)} 分钟`;
    $('#jyc-current').firstChild.textContent = `${formatMinutes(siteSeconds)} `;
    $('#jyc-category').textContent = category;
    $('#jyc-goal-bar').style.width = `${Math.min(100, (record.total / goalSeconds) * 100)}%`;
    $('#jyc-status').textContent = shouldTrack() ? `正在统计 · ${safeText(host)}` : (data.settings.enabled ? '已暂停：页面不活跃或进入空闲' : '时间统计已关闭');
    $('#jyc-goal').value = String(data.settings.goalMinutes);
    $('#jyc-idle').value = String(data.settings.idleSeconds);
    $('#jyc-enabled').checked = Boolean(data.settings.enabled);
    $('#jyc-count-ai').checked = Boolean(data.settings.countAI);
    $('#jyc-focus-stop').disabled = !data.focus.running;
    renderSites(record);
    renderWeek();
  }

  function updateLiveUI() {
    const record = dayRecord();
    $('#jyc-fab-time').textContent = shortTime(record.total);
    fab.style.display = data.settings.showFab ? 'flex' : 'none';
    if (panelOpen) render();
    if (data.focus.running) {
      const remaining = data.focus.endsAt - Date.now();
      if (remaining <= 0) {
        data.focus.running = false;
        saveData();
        toast('专注计时完成，休息一下吧。');
        if ('Notification' in window && Notification.permission === 'granted') new Notification('JackYun 专注完成', { body: '本轮专注计时已结束。' });
      } else {
        const minutes = Math.ceil(remaining / 60000);
        $('#jyc-focus-stop').textContent = `结束计时（剩余 ${minutes} 分）`;
      }
    } else {
      $('#jyc-focus-stop').textContent = '结束计时';
    }
  }

  function startFocus(minutes) {
    data.focus = { running: true, endsAt: Date.now() + minutes * 60000, duration: minutes };
    saveData();
    toast(`已开始 ${minutes} 分钟专注`);
    render();
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `jackyun-study-time-${nowIsoDay()}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function annotatePortalLinks() {
    if (!isPortal) return;
    const record = dayRecord();
    document.querySelectorAll('a[href^="http"]:not([data-jyc-badge])').forEach((link) => {
      try {
        const linkHost = new URL(link.href).hostname.replace(/^www\./, '');
        const seconds = record.sites[linkHost] || 0;
        link.dataset.jycBadge = 'true';
        if (!seconds) return;
        const badge = document.createElement('span');
        badge.className = 'jyc-time-badge';
        badge.textContent = `今日 ${shortTime(seconds)}`;
        link.appendChild(badge);
      } catch { /* Ignore invalid URLs. */ }
    });
  }

  fab.addEventListener('click', () => togglePanel());
  $('#jyc-close').addEventListener('click', () => togglePanel(false));
  $('#jyc-focus-25').addEventListener('click', () => startFocus(25));
  $('#jyc-focus-50').addEventListener('click', () => startFocus(50));
  $('#jyc-focus-stop').addEventListener('click', () => { data.focus.running = false; saveData(); toast('专注计时已结束'); render(); });
  $('#jyc-notify').addEventListener('click', async () => {
    if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
    toast('提示功能正常');
  });
  $('#jyc-goal').addEventListener('change', (event) => { data.settings.goalMinutes = Math.min(1440, Math.max(10, Number(event.target.value) || 120)); saveData(); render(); });
  $('#jyc-idle').addEventListener('change', (event) => { data.settings.idleSeconds = Number(event.target.value); saveData(); render(); });
  $('#jyc-enabled').addEventListener('change', (event) => { data.settings.enabled = event.target.checked; saveData(); render(); });
  $('#jyc-count-ai').addEventListener('change', (event) => { data.settings.countAI = event.target.checked; saveData(); render(); });
  $('#jyc-export').addEventListener('click', exportData);
  $('#jyc-import').addEventListener('click', () => $('#jyc-file').click());
  $('#jyc-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (!imported || imported.version !== 1 || typeof imported.daily !== 'object') throw new Error('Invalid backup');
      data = { ...defaultData(), ...imported, settings: { ...defaultData().settings, ...(imported.settings || {}) } };
      saveData();
      render();
      toast('备份已导入');
    } catch {
      toast('导入失败：文件格式不正确');
    }
    event.target.value = '';
  });
  $('#jyc-reset').addEventListener('click', () => {
    if (!window.confirm('确定清除全部学习时间统计吗？建议先导出备份。')) return;
    const settings = data.settings;
    data = defaultData();
    data.settings = settings;
    saveData();
    render();
    toast('统计数据已清除');
  });
  $('#jyc-hide-fab').addEventListener('click', () => { data.settings.showFab = false; saveData(); togglePanel(false); toast('可从 Tampermonkey 菜单重新显示'); });
  document.addEventListener('keydown', (event) => {
    if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'j') {
      event.preventDefault();
      data.settings.showFab = true;
      togglePanel();
    }
    if (event.key === 'Escape' && panelOpen) togglePanel(false);
  }, true);

  GM_registerMenuCommand('打开学习助手（Alt+Shift+J）', () => { data.settings.showFab = true; togglePanel(true); });
  GM_registerMenuCommand(data.settings.enabled ? '暂停时间统计' : '恢复时间统计', () => { data.settings.enabled = !data.settings.enabled; saveData(); render(); });
  GM_registerMenuCommand('导出学习统计 JSON', exportData);

  render();
  annotatePortalLinks();
  window.setInterval(heartbeat, HEARTBEAT_MS);
  window.setInterval(annotatePortalLinks, 5000);
})();
