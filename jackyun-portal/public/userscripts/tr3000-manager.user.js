// ==UserScript==
// @name         JackYun TR3000 管理增强器
// @namespace    https://jackyun.top/
// @version      2.0.0
// @description  为 Cudy TR3000 增加可用的三档 QoS、原生备注同步、新设备队列和全屏管理台。
// @author       JackYun
// @match        http://192.168.10.1/*
// @icon         http://192.168.10.1/luci-static/light/img/favicon.ico
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @downloadURL  https://jackyun.top/userscripts/tr3000-manager.user.js
// @updateURL    https://jackyun.top/userscripts/tr3000-manager.user.js
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '2.0.0';
  const PREFIX = 'jy_tr3000_';
  const HOST_ID = 'jy-tr3000-manager-host';
  const MAC_RE = /\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b/i;
  const PRIVATE_IP_RE = /\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/;

  function normalizeMac(value) {
    const normalized = String(value || '').trim().replaceAll('-', ':').toUpperCase();
    return /^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(normalized) ? normalized : undefined;
  }

  function extractMac(text) {
    return normalizeMac(String(text || '').match(MAC_RE)?.[0]);
  }

  function extractPrivateIp(text) {
    const value = String(text || '').match(PRIVATE_IP_RE)?.[0];
    if (!value) return undefined;
    return value.split('.').map(Number).every((n) => n >= 0 && n <= 255) ? value : undefined;
  }

  function normalizeRate(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0.01 && n <= 10000 ? Math.round(n * 100) / 100 : fallback;
  }

  function cleanDeviceName(text, mac, ip) {
    const ignored = /^(\d+|在线|离线|有线|无线|(?:2\.4g|5g)?\s*wifi|ethernet|unknown|未知|详情|编辑|限速|qos|-?\d+\s*dBm)$/i;
    return String(text || '').split(/[\n\r|]+/)
      .map((part) => part.trim().replace(/\s+/g, ' '))
      .filter(Boolean)
      .filter((part) => !mac || !part.toUpperCase().includes(mac))
      .filter((part) => !ip || !part.includes(ip))
      .find((part) => part.length <= 80 && !ignored.test(part) && !/\b(?:K|M|G)bps\b/i.test(part)) || '未命名设备';
  }

  function extractDeviceNameFromCells(cells, mac, ip) {
    const preferred = Array.from(cells || []).slice(1, 3).map(String).join('\n');
    const name = cleanDeviceName(preferred, mac, ip);
    return name !== '未命名设备' ? name : cleanDeviceName(Array.from(cells || []).join('\n'), mac, ip);
  }

  function validateProfiles(value = {}) {
    const defaults = {
      low: { label: '低配额', down: 5, up: 2, color: '#ef4444' },
      medium: { label: '中配额', down: 30, up: 10, color: '#f59e0b' },
      high: { label: '高配额', down: 100, up: 30, color: '#22c55e' },
    };
    return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, {
      ...fallback,
      down: normalizeRate(value[key]?.down, fallback.down),
      up: normalizeRate(value[key]?.up, fallback.up),
    }]));
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
    }[char]));
  }

  const CORE = Object.freeze({ normalizeMac, extractMac, extractPrivateIp, normalizeRate, cleanDeviceName, extractDeviceNameFromCells, validateProfiles });
  if (typeof document === 'undefined') {
    globalThis.__TR3000_MANAGER_CORE__ = CORE;
    return;
  }

  const DEFAULTS = {
    profiles: validateProfiles(),
    defaultTier: 'low',
    autoNew: false,
    safeMode: true,
    scanSeconds: 5,
    open: true,
    tab: 'devices',
    trusted: [],
    aliases: {},
    tiers: {},
    nativeRemarks: {},
    fullPage: true,
  };

  const store = {
    get(key, fallback) {
      try {
        if (typeof GM_getValue === 'function') return GM_getValue(PREFIX + key, fallback);
        const value = localStorage.getItem(PREFIX + key);
        return value ? JSON.parse(value) : fallback;
      } catch { return fallback; }
    },
    set(key, value) {
      try {
        if (typeof GM_setValue === 'function') GM_setValue(PREFIX + key, value);
        else localStorage.setItem(PREFIX + key, JSON.stringify(value));
      } catch (error) { console.warn('[TR3000 Manager] local save failed', error); }
    },
  };

  const saved = store.get('config', {});
  let config = {
    ...DEFAULTS,
    ...saved,
    profiles: validateProfiles(saved.profiles),
    trusted: Array.isArray(saved.trusted) ? saved.trusted.map(normalizeMac).filter(Boolean) : [],
    aliases: saved.aliases && typeof saved.aliases === 'object' ? saved.aliases : {},
    tiers: saved.tiers && typeof saved.tiers === 'object' ? saved.tiers : {},
    nativeRemarks: saved.nativeRemarks && typeof saved.nativeRemarks === 'object' ? saved.nativeRemarks : {},
  };
  let known = store.get('known', {});
  let queue = store.get('queue', []);
  let logs = store.get('logs', []);
  let devices = [];
  let selected = new Set();
  let search = '';
  let filter = 'all';
  let host;
  let shadow;
  let timer;
  let toastTimer;
  let autoBusy = false;
  let renderPending = false;
  let scanDebounce;

  const saveConfig = () => store.set('config', config);
  const displayName = (device) => config.aliases[device.mac] || config.nativeRemarks[device.mac] || device.name || '未命名设备';
  const findDevice = (mac) => devices.find((device) => device.mac === normalizeMac(mac));
  const visible = (el) => el instanceof Element && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;

  function addLog(level, message, details = '') {
    logs.unshift({ id: `${Date.now()}-${Math.random()}`, level, message, details, at: new Date().toISOString() });
    logs = logs.slice(0, 200);
    store.set('logs', logs);
  }

  function putQueue(device, action, source = 'manual') {
    const current = queue.find((item) => item.mac === device.mac && item.status === 'pending');
    const entry = {
      id: current?.id || `${Date.now()}-${device.mac}`,
      mac: device.mac,
      ip: device.ip,
      name: displayName(device),
      action,
      source,
      status: 'pending',
      createdAt: current?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    queue = current ? queue.map((item) => item.id === current.id ? entry : item) : [entry, ...queue];
    queue = queue.slice(0, 200);
    store.set('queue', queue);
    return entry;
  }

  function toast(message, type = 'info') {
    const el = shadow?.querySelector('.toast');
    if (!el) return;
    el.textContent = message;
    el.dataset.type = type;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3600);
  }

  function requestRender(force = false) {
    if (!force && shadow?.activeElement?.matches?.('input,select,textarea')) {
      renderPending = true;
      return;
    }
    renderPending = false;
    render();
  }

  function rowCells(el) {
    const cells = [...el.querySelectorAll(':scope > th,:scope > td')];
    return cells.length ? cells.map((cell) => (cell.innerText || cell.textContent || '').trim()) : [];
  }

  function scanDevices() {
    const candidates = document.querySelectorAll('tr,.device-item,.client-item,.cbi-section-table-row,.list-group-item,.panel-body,.card');
    const found = new Map();
    for (const el of candidates) {
      if (!visible(el) || host?.contains(el)) continue;
      const text = el.innerText || el.textContent || '';
      const mac = extractMac(text);
      if (!mac) continue;
      const ip = extractPrivateIp(text);
      const cells = rowCells(el);
      const candidate = { mac, ip, name: extractDeviceNameFromCells(cells.length ? cells : [text], mac, ip), element: el, raw: text };
      if (!found.has(mac) || text.length < found.get(mac).raw.length) found.set(mac, candidate);
    }
    devices = [...found.values()].map((device) => ({
      ...device,
      trusted: config.trusted.includes(device.mac),
      tier: config.tiers[device.mac],
    }));

    const baselineReady = store.get('baselineReady', false);
    if (!baselineReady && devices.length) {
      for (const device of devices) known[device.mac] = { firstSeen: new Date().toISOString(), name: device.name, ip: device.ip };
      store.set('known', known);
      store.set('baselineReady', true);
      addLog('success', `已建立 ${devices.length} 台现有设备的基线`, '首次运行不会自动限速现有设备。');
    } else if (baselineReady) {
      for (const device of devices) {
        const isNew = !known[device.mac];
        known[device.mac] = { ...known[device.mac], firstSeen: known[device.mac]?.firstSeen || new Date().toISOString(), lastSeen: new Date().toISOString(), name: device.name, ip: device.ip };
        if (isNew) handleNew(device);
      }
      store.set('known', known);
    }
    syncNativeRemarks();
    requestRender();
  }

  function handleNew(device) {
    if (config.trusted.includes(device.mac)) return;
    putQueue(device, config.defaultTier, 'new-device');
    addLog('warning', `发现新设备：${displayName(device)}`, `${device.ip || '无 IP'} · ${device.mac}`);
    toast(`新设备已加入${config.profiles[config.defaultTier].label}队列`, 'warning');
    if (config.autoNew && !autoBusy) {
      autoBusy = true;
      applyTier(device, config.defaultTier, 'new-device').finally(() => { autoBusy = false; });
    }
  }

  function findControl(root, patterns) {
    return [...(root?.querySelectorAll?.('button,a,input[type="button"],input[type="submit"]') || [])].find((control) => {
      const text = `${control.innerText || ''} ${control.value || ''} ${control.title || ''} ${control.getAttribute('aria-label') || ''}`;
      return visible(control) && patterns.some((pattern) => pattern.test(text));
    });
  }

  function findInput(root, patterns) {
    return [...root.querySelectorAll('input:not([type="hidden"]),select')].find((input) => {
      const group = input.closest('.form-group,.cbi-value,tr,.row,label,div');
      const text = `${group?.innerText || ''} ${input.name || ''} ${input.id || ''} ${input.placeholder || ''}`;
      return visible(input) && patterns.some((pattern) => pattern.test(text));
    });
  }

  function setInput(input, value) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
    if (setter) setter.call(input, String(value)); else input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fieldText(input) {
    const group = input.closest('.form-group,.cbi-value,tr,.row,label,div');
    return `${group?.innerText || ''} ${input.name || ''} ${input.id || ''} ${input.placeholder || ''}`;
  }

  function findQosLink() {
    const candidates = [...document.querySelectorAll('a[href],[data-href]')];
    const found = candidates.find((item) => /qos|服务质量|流量控制|带宽控制|智能限速/i.test(`${item.innerText || ''} ${item.getAttribute('href') || ''} ${item.dataset.href || ''}`));
    if (!found) return undefined;
    const raw = found.href || found.dataset.href;
    if (!raw) return undefined;
    const url = new URL(raw, location.href);
    return url.origin === location.origin ? url.href : undefined;
  }

  function isQosPage() {
    return /qos|服务质量|流量控制|带宽控制|智能限速/i.test(`${location.pathname} ${document.title} ${document.querySelector('h1,h2,.title,.breadcrumb')?.textContent || ''}`);
  }

  function nativeRemarkFromRow(row, mac, ip) {
    const ignored = /^(\d+|启用|禁用|开启|关闭|编辑|删除|操作|下载|上传|上行|下行|不限|unlimited)$/i;
    return rowCells(row)
      .flatMap((cell) => cell.split(/[\n\r|]+/))
      .map((part) => part.trim().replace(/\s+/g, ' '))
      .filter((part) => part && part.length <= 60)
      .filter((part) => !ignored.test(part) && !extractMac(part) && !extractPrivateIp(part))
      .filter((part) => !/^(?:\d+(?:\.\d+)?\s*)?(?:K|M|G)?bps$/i.test(part) && part !== ip && part.toUpperCase() !== mac)
      .at(-1);
  }

  function syncNativeRemarks() {
    if (!isQosPage()) return;
    let changed = false;
    for (const row of document.querySelectorAll('tr,.cbi-section-table-row,.list-group-item,.card')) {
      if (host?.contains(row)) continue;
      const text = row.innerText || row.textContent || '';
      const mac = extractMac(text);
      if (!mac) continue;
      const remark = nativeRemarkFromRow(row, mac, extractPrivateIp(text));
      if (remark && config.nativeRemarks[mac] !== remark) {
        config.nativeRemarks[mac] = remark;
        changed = true;
      }
    }
    if (changed) saveConfig();
  }

  function findRowByMac(mac) {
    return [...document.querySelectorAll('tr,.cbi-section-table-row,.list-group-item,.card')]
      .find((row) => !host?.contains(row) && extractMac(row.innerText || row.textContent || '') === mac);
  }

  async function waitForEditor() {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const dialog = [...document.querySelectorAll('.modal.in,.modal.show,[role="dialog"],.cbi-modal')].find(visible);
      const root = dialog || document;
      const inputs = [...root.querySelectorAll('input:not([type="hidden"]),select')].filter(visible);
      if (inputs.some((input) => /mac|物理地址|硬件地址/i.test(fieldText(input))) && inputs.length >= 3) return root;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return undefined;
  }

  async function fillNative(device, tier) {
    const profile = config.profiles[tier];
    if (!isQosPage()) {
      store.set('pendingNative', { mac: device.mac, ip: device.ip, name: displayName(device), tier, at: Date.now() });
      return await openQos()
        ? { ok: true, navigating: true, message: '正在打开原生 QoS，进入后会按 MAC 继续填写' }
        : { ok: false, message: '未在当前固件菜单中发现 QoS 链接；请先手动打开 QoS 页面，再点击重试' };
    }
    const row = findRowByMac(device.mac);
    let editor = row && findControl(row, [/编辑/i, /edit/i, /修改/i, /modify/i]);
    if (!editor) editor = findControl(document, [/新增/i, /添加/i, /add/i, /create/i]);
    if (!editor) return { ok: false, message: '已到 QoS 页面，但没有识别到“编辑”或“新增”按钮' };
    editor.click();
    const dialog = await waitForEditor();
    if (!dialog) return { ok: false, message: '原生编辑器已打开，但没有识别到完整表单' };
    const macInput = findInput(dialog, [/mac/i, /物理地址/i, /硬件地址/i, /设备地址/i]);
    const down = findInput(dialog, [/下行/i, /下载/i, /download/i, /\bdown\b/i, /\bdl\b/i, /\brx\b/i]);
    const up = findInput(dialog, [/上行/i, /上传/i, /upload/i, /\bup\b/i, /\bul\b/i, /\btx\b/i]);
    const remark = findInput(dialog, [/备注/i, /remark/i, /comment/i, /名称/i, /name/i]);
    if (!macInput || !down || !up) return { ok: false, message: '无法同时识别 MAC、下行和上行字段，已停止填写' };
    setInput(macInput, device.mac);
    setInput(down, profile.down);
    setInput(up, profile.up);
    if (remark) {
      const value = config.aliases[device.mac] || config.nativeRemarks[device.mac] || device.name;
      if (value) setInput(remark, String(value).slice(0, 60));
    }
    store.set('pendingNative', null);
    if (config.safeMode) {
      down.focus();
      return { ok: true, applied: false, message: '已按 MAC 填入原生 QoS；请核对备注和速率后手动保存&应用' };
    }
    const save = findControl(dialog, [/保存\s*&?\s*应用/i, /保存应用/i, /save\s*&?\s*apply/i]);
    if (!save) return { ok: true, applied: false, message: '已填表，但未找到可靠的保存&应用按钮' };
    save.click();
    return { ok: true, applied: true, message: '已触发原生保存&应用' };
  }

  async function applyTier(device, tier, source = 'manual') {
    if (!device || !config.profiles[tier]) return;
    putQueue(device, tier, source);
    const result = await fillNative(device, tier);
    if (result.navigating) return;
    if (result.ok) {
      config.tiers[device.mac] = tier;
      saveConfig();
      queue = queue.map((item) => item.mac === device.mac && item.status === 'pending'
        ? { ...item, status: result.applied ? 'applied' : 'prepared', updatedAt: new Date().toISOString() }
        : item);
      store.set('queue', queue);
      addLog(result.applied ? 'success' : 'info', `${displayName(device)} → ${config.profiles[tier].label}`, result.message);
      toast(result.message, result.applied ? 'success' : 'info');
    } else {
      addLog('warning', `${displayName(device)} 已加入待办`, result.message);
      toast(`${result.message}，已保留待办`, 'warning');
    }
    requestRender();
  }

  async function openQos() {
    let href = findQosLink();
    if (!href) {
      const advanced = findControl(document, [/高级设置/i, /advanced\s*settings/i]);
      if (advanced) {
        advanced.click();
        await new Promise((resolve) => setTimeout(resolve, 500));
        href = findQosLink();
      }
    }
    if (href) { location.assign(href); return true; }
    toast('没有从固件菜单识别到 QoS 链接，请手动打开 QoS 后在队列中重试', 'warning');
    return false;
  }

  async function resumePendingNative() {
    const pending = store.get('pendingNative', null);
    if (!pending || !isQosPage() || Date.now() - Number(pending.at || 0) > 10 * 60 * 1000) return;
    await new Promise((resolve) => setTimeout(resolve, 600));
    const device = { ...pending, name: pending.name || '未命名设备', element: findRowByMac(pending.mac) };
    const result = await fillNative(device, pending.tier);
    toast(result.message, result.ok ? 'info' : 'warning');
    addLog(result.ok ? 'info' : 'warning', `${displayName(device)} → ${config.profiles[pending.tier]?.label || pending.tier}`, result.message);
  }

  function toggleTrusted(device) {
    const exists = config.trusted.includes(device.mac);
    config.trusted = exists ? config.trusted.filter((mac) => mac !== device.mac) : [...config.trusted, device.mac];
    saveConfig();
    addLog('info', `${displayName(device)} ${exists ? '取消信任' : '标记为信任'}`, device.mac);
    scanDevices();
  }

  function requestUnlimited(device) {
    putQueue(device, 'unlimited');
    addLog('info', `${displayName(device)} 已加入解除限速待办`, '不猜测 0 Mbps 的含义，请在原生 QoS 中删除或停用规则。');
    toast('已加入解除限速待办', 'info');
    openQos();
    render();
  }

  function rename(device) {
    const value = prompt('输入本地设备备注（不会发送到互联网）', displayName(device));
    if (value === null) return;
    const name = value.trim().slice(0, 60);
    if (name) config.aliases[device.mac] = name; else delete config.aliases[device.mac];
    saveConfig();
    render();
  }

  function filteredDevices() {
    const needle = search.trim().toLowerCase();
    return devices.filter((device) => {
      const queryMatch = !needle || [displayName(device), device.mac, device.ip].join(' ').toLowerCase().includes(needle);
      const filterMatch = filter === 'all'
        || (filter === 'trusted' && config.trusted.includes(device.mac))
        || (filter === 'new' && !config.tiers[device.mac] && !config.trusted.includes(device.mac))
        || config.tiers[device.mac] === filter;
      return queryMatch && filterMatch;
    });
  }

  function badge(device) {
    if (config.trusted.includes(device.mac)) return '<span class="badge trusted">信任</span>';
    const tier = config.tiers[device.mac];
    return tier ? `<span class="badge" style="--c:${config.profiles[tier].color}">${config.profiles[tier].label}</span>` : '<span class="badge unknown">待分级</span>';
  }

  function deviceCard(device) {
    const tiers = ['low', 'medium', 'high'].map((tier) => `<button class="tier" data-action="tier" data-tier="${tier}" data-mac="${device.mac}" style="--c:${config.profiles[tier].color}" title="下载 ${config.profiles[tier].down} / 上传 ${config.profiles[tier].up} Mbps">${config.profiles[tier].label}</button>`).join('');
    return `<article class="device ${device.trusted ? 'trusted-device' : ''}">
      <div class="device-head"><input type="checkbox" data-action="select" data-mac="${device.mac}" ${selected.has(device.mac) ? 'checked' : ''}><div><div class="title"><strong>${escapeHtml(displayName(device))}</strong>${badge(device)}</div><p><code>${device.ip || 'IP 未显示'}</code><code>${device.mac}</code></p></div><button class="icon" data-action="rename" data-mac="${device.mac}">✎</button></div>
      <div class="tiers">${tiers}</div>
      <div class="actions"><button data-action="trust" data-mac="${device.mac}">${device.trusted ? '取消信任' : '标记信任'}</button><button data-action="unlimited" data-mac="${device.mac}">解除限速</button><button data-action="copy" data-mac="${device.mac}">复制 MAC</button></div>
    </article>`;
  }

  function devicesView() {
    const list = filteredDevices();
    return `<div class="toolbar"><label><span>⌕</span><input data-role="search" value="${escapeHtml(search)}" placeholder="搜索名称、IP 或 MAC"></label><button data-action="scan">刷新</button></div>
      <div class="filters">${[['all', '全部'], ['new', '待分级'], ['trusted', '信任'], ['low', '低'], ['medium', '中'], ['high', '高']].map(([id, name]) => `<button data-action="filter" data-filter="${id}" class="${filter === id ? 'active' : ''}">${name}</button>`).join('')}</div>
      ${selected.size ? `<div class="batch"><span>已选 ${selected.size} 台</span>${['low', 'medium', 'high'].map((tier) => `<button data-action="batch" data-tier="${tier}">${config.profiles[tier].label[0]}</button>`).join('')}<button data-action="batch-trust">信任</button><button data-action="clear-selected">清除</button></div>` : ''}
      <div class="list">${list.length ? list.map(deviceCard).join('') : '<div class="empty"><strong>当前页面未识别到设备</strong><p>请打开“网络设备/在线设备”页面后刷新。识别失败时不会发送配置。</p><button data-action="open-qos">打开原生 QoS</button></div>'}</div>`;
  }

  function queueView() {
    return `<div class="section-title"><div><strong>操作队列</strong><p>自动识别失败或需要复核的操作保存在这里。</p></div><button data-action="clear-finished">清理已完成</button></div><div class="list">${queue.length ? queue.map((item) => {
      const label = config.profiles[item.action]?.label || (item.action === 'unlimited' ? '解除限速' : item.action);
      return `<article class="queue"><div><strong>${escapeHtml(item.name)}</strong><span class="status ${item.status}">${item.status === 'pending' ? '待处理' : item.status === 'prepared' ? '待保存' : '已应用'}</span><p>${item.ip || '无 IP'} · ${item.mac}</p><p>${label}</p></div><div>${item.status === 'pending' && config.profiles[item.action] ? `<button data-action="retry" data-id="${item.id}">重试</button>` : ''}<button data-action="remove-queue" data-id="${item.id}">移除</button></div></article>`;
    }).join('') : '<div class="empty"><strong>没有待办操作</strong></div>'}</div>`;
  }

  function profileEditor(tier) {
    const profile = config.profiles[tier];
    return `<div class="profile" style="--c:${profile.color}"><strong>${profile.label}</strong><label>下载 Mbps<input type="number" min="0.01" max="10000" step="0.01" data-profile="${tier}.down" value="${profile.down}"></label><label>上传 Mbps<input type="number" min="0.01" max="10000" step="0.01" data-profile="${tier}.up" value="${profile.up}"></label></div>`;
  }

  function settingsView() {
    return `<section class="card"><strong>三档配额</strong><p>范围 0.01–10000 Mbps。</p><div class="profile-grid">${['low', 'medium', 'high'].map(profileEditor).join('')}</div><button class="primary wide" data-action="save-profiles">保存三档配置</button></section>
      <section class="card"><strong>新设备策略</strong><label class="field">默认档位<select data-setting="defaultTier"><option value="low" ${config.defaultTier === 'low' ? 'selected' : ''}>低配额</option><option value="medium" ${config.defaultTier === 'medium' ? 'selected' : ''}>中配额</option><option value="high" ${config.defaultTier === 'high' ? 'selected' : ''}>高配额</option></select></label><label class="switch"><input type="checkbox" data-setting="autoNew" ${config.autoNew ? 'checked' : ''}><span></span><div><strong>自动处理新设备</strong><small>发现基线外的新 MAC 后打开并填写原生 QoS。</small></div></label><label class="switch"><input type="checkbox" data-setting="safeMode" ${config.safeMode ? 'checked' : ''}><span></span><div><strong>安全模式（建议开启）</strong><small>只填表，不自动点击“保存&应用”。</small></div></label><label class="field">扫描间隔（秒）<input type="number" min="3" max="60" data-setting="scanSeconds" value="${config.scanSeconds}"></label></section>
      <section class="card"><strong>配置备份</strong><p>不包含路由器密码。</p><div class="two"><button data-action="export">导出 JSON</button><button data-action="import">导入 JSON</button></div><input hidden type="file" accept="application/json" data-role="import-file"></section>
      <section class="card danger"><strong>设备基线</strong><p>下次扫描把当前在线设备视为已有设备。</p><button data-action="reset-baseline">重新建立基线</button></section>`;
  }

  function helpView() {
    return `<div class="guide"><section><strong>推荐工作流</strong><ol><li>打开“网络设备”页，先建立现有设备基线。</li><li>配置低、中、高三档速率。</li><li>保持安全模式，对一台非管理设备测试。</li><li>核对原生 QoS 的 MAC、上下行、备注，再手动保存。</li><li>确认固件字段稳定后，再考虑自动应用。</li></ol></section><section><strong>三档建议</strong><p>低配额用于陌生访客，中配额用于普通访客，高配额用于已确认的朋友和主要设备。数值完全由你配置。</p></section><section><strong>信任与解除</strong><p>信任设备跳过新设备策略。因不同固件对 0 Mbps 含义不同，解除限速只创建待办并打开原生 QoS，不会猜测。</p></section><section><strong>隐私和兼容</strong><p>脚本只在 192.168.10.1 工作，不保存密码、不上传 MAC/IP，也不调用未经验证的私有 API。固件升级后请重新用安全模式验证。</p></section></div>`;
  }

  function logsView() {
    return `<div class="section-title"><div><strong>本地日志</strong><p>最多保留 200 条。</p></div><button data-action="clear-logs">清空</button></div><div class="list">${logs.length ? logs.map((item) => `<article class="log ${item.level}"><i></i><div><strong>${escapeHtml(item.message)}</strong><p>${escapeHtml(item.details)}</p><small>${new Date(item.at).toLocaleString()}</small></div></article>`).join('') : '<div class="empty"><strong>暂无日志</strong></div>'}</div>`;
  }

  function render() {
    if (!shadow) return;
    const active = shadow.activeElement;
    const focusKey = active?.dataset ? Object.entries(active.dataset).find(([key]) => ['role', 'profile', 'setting'].includes(key)) : undefined;
    const focusState = focusKey ? { selector: `[data-${focusKey[0]}="${CSS.escape(focusKey[1])}"]`, value: active.value, start: active.selectionStart, end: active.selectionEnd } : undefined;
    const pending = queue.filter((item) => item.status === 'pending').length;
    const views = { devices: devicesView, queue: queueView, settings: settingsView, help: helpView, logs: logsView };
    shadow.querySelector('.shell').classList.toggle('open', config.open);
    shadow.querySelector('.shell').classList.toggle('full-page', config.fullPage);
    shadow.querySelector('.panel').innerHTML = `<header><div><span>JACKYUN · TR3000</span><h2>网络管理中心</h2></div><div class="header-actions"><button data-action="fullscreen" title="${config.fullPage ? '切换侧边栏' : '切换全屏'}">${config.fullPage ? '↙' : '↗'}</button><button data-action="close">×</button></div></header><div class="summary"><div><b>${devices.length}</b><small>当前设备</small></div><div><b>${devices.filter((d) => d.trusted).length}</b><small>信任设备</small></div><div><b>${pending}</b><small>待处理</small></div></div><nav>${[['devices', '设备'], ['queue', `队列${pending ? ` ${pending}` : ''}`], ['settings', '配置'], ['help', '说明'], ['logs', '日志']].map(([id, label]) => `<button data-action="tab" data-tab="${id}" class="${config.tab === id ? 'active' : ''}">${label}</button>`).join('')}</nav><main>${views[config.tab]?.() || devicesView()}</main><footer><span><i class="${config.safeMode ? 'safe' : 'unsafe'}"></i>${config.safeMode ? '安全模式：由你确认保存' : '自动应用模式'}</span><button data-action="open-qos">原生 QoS ↗</button><small>v${VERSION}</small></footer>`;
    const bubble = shadow.querySelector('.bubble b');
    bubble.textContent = pending || '';
    if (focusState) {
      const next = shadow.querySelector(focusState.selector);
      if (next) {
        next.value = focusState.value;
        next.focus();
        if (typeof next.setSelectionRange === 'function' && focusState.start !== null) next.setSelectionRange(focusState.start, focusState.end);
      }
    }
  }

  function exportConfig() {
    const blob = new Blob([JSON.stringify({ schema: 1, config, known, queue }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tr3000-manager-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importConfig(file) {
    try {
      const data = JSON.parse(await file.text());
      if (data.schema !== 1 || !data.config) throw new Error('不支持的格式');
      config = { ...DEFAULTS, ...data.config, profiles: validateProfiles(data.config.profiles) };
      known = data.known && typeof data.known === 'object' ? data.known : {};
      queue = Array.isArray(data.queue) ? data.queue.slice(0, 200) : [];
      saveConfig(); store.set('known', known); store.set('queue', queue);
      restart(); scanDevices(); toast('配置导入成功', 'success');
    } catch (error) { toast(`导入失败：${error.message}`, 'warning'); }
  }

  function settingChanged(input) {
    const key = input.dataset.setting;
    if (input.type === 'checkbox') {
      if (key === 'safeMode' && !input.checked && !confirm('关闭安全模式会允许脚本点击原生“保存&应用”，可能立即改变设备网速。确认继续吗？')) {
        input.checked = true;
        return;
      }
      config[key] = input.checked;
    } else if (key === 'scanSeconds') {
      config[key] = Math.min(60, Math.max(3, Number(input.value) || 5));
      restart();
    } else config[key] = input.value;
    saveConfig();
  }

  async function clicked(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const device = button.dataset.mac ? findDevice(button.dataset.mac) : undefined;
    if (action === 'toggle' || action === 'close') { config.open = action === 'toggle' ? !config.open : false; saveConfig(); render(); }
    else if (action === 'fullscreen') { config.fullPage = !config.fullPage; saveConfig(); render(); }
    else if (action === 'tab') { config.tab = button.dataset.tab; saveConfig(); render(); }
    else if (action === 'filter') { filter = button.dataset.filter; render(); }
    else if (action === 'scan') { scanDevices(); toast('扫描完成', 'success'); }
    else if (action === 'tier') await applyTier(device, button.dataset.tier);
    else if (action === 'trust') toggleTrusted(device);
    else if (action === 'rename') rename(device);
    else if (action === 'unlimited') requestUnlimited(device);
    else if (action === 'copy') { await navigator.clipboard.writeText(device.mac); toast('MAC 已复制', 'success'); }
    else if (action === 'open-qos') await openQos();
    else if (action === 'select') { if (button.checked) selected.add(device.mac); else selected.delete(device.mac); render(); }
    else if (action === 'clear-selected') { selected.clear(); render(); }
    else if (action === 'batch') {
      const targets = [...selected].map(findDevice).filter(Boolean);
      if (targets.length && confirm(`将 ${targets.length} 台设备加入${config.profiles[button.dataset.tier].label}队列，继续吗？`)) {
        for (const target of targets) putQueue(target, button.dataset.tier, 'batch');
        if (config.safeMode) {
          await applyTier(targets[0], button.dataset.tier, 'batch');
          toast(`已将 ${targets.length} 台加入队列；安全模式只打开第一台供核对`, 'info');
        } else {
          for (const target of targets) {
            await applyTier(target, button.dataset.tier, 'batch');
            await new Promise((resolve) => setTimeout(resolve, 900));
          }
        }
        selected.clear(); render();
      }
    } else if (action === 'batch-trust') {
      for (const target of [...selected].map(findDevice).filter(Boolean)) if (!config.trusted.includes(target.mac)) config.trusted.push(target.mac);
      saveConfig(); selected.clear(); scanDevices();
    } else if (action === 'retry') {
      const item = queue.find((entry) => entry.id === button.dataset.id);
      if (item) await applyTier(findDevice(item.mac) || item, item.action, 'retry');
    } else if (action === 'remove-queue') { queue = queue.filter((item) => item.id !== button.dataset.id); store.set('queue', queue); render(); }
    else if (action === 'clear-finished') { queue = queue.filter((item) => item.status === 'pending'); store.set('queue', queue); render(); }
    else if (action === 'clear-logs' && confirm('清空本地日志吗？')) { logs = []; store.set('logs', logs); render(); }
    else if (action === 'save-profiles') {
      const next = {};
      for (const tier of ['low', 'medium', 'high']) next[tier] = { down: shadow.querySelector(`[data-profile="${tier}.down"]`).value, up: shadow.querySelector(`[data-profile="${tier}.up"]`).value };
      config.profiles = validateProfiles(next); saveConfig(); addLog('success', '已更新三档配额'); toast('三档配额已保存', 'success'); render();
    } else if (action === 'export') exportConfig();
    else if (action === 'import') shadow.querySelector('[data-role="import-file"]').click();
    else if (action === 'reset-baseline' && confirm('把当前在线设备重新设为已有基线吗？')) {
      known = {}; store.set('known', known); store.set('baselineReady', false); scanDevices(); toast('已重建基线', 'success');
    }
  }

  const CSS = `
    :host{all:initial}*,*::before,*::after{box-sizing:border-box}.shell{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;color:#e8eef9;position:fixed;z-index:2147483646;pointer-events:none}.bubble{pointer-events:auto;position:fixed;right:18px;bottom:20px;width:58px;height:58px;border:0;border-radius:20px;background:linear-gradient(145deg,#2563eb,#06b6d4);color:#fff;box-shadow:0 16px 45px #02061766;cursor:pointer;font-weight:800}.bubble b{position:absolute;right:-4px;top:-5px;min-width:20px;height:20px;border-radius:10px;background:#ef4444;font-size:11px;line-height:20px}.panel{pointer-events:auto;position:fixed;right:16px;top:16px;bottom:16px;width:min(450px,calc(100vw - 24px));display:flex;flex-direction:column;overflow:hidden;border:1px solid #94a3b838;border-radius:24px;background:#08101cf8;box-shadow:0 32px 100px #02061799;transform:translateX(calc(100% + 28px));opacity:0;transition:.22s}.open .panel{transform:none;opacity:1}.open .bubble{opacity:0;pointer-events:none}.full-page .panel{inset:0;width:100vw;border:0;border-radius:0;background:#08101c}.full-page main{width:min(1180px,100%);margin-inline:auto}.header-actions{display:flex;gap:8px}header{display:flex;justify-content:space-between;align-items:center;padding:20px 22px 14px;background:linear-gradient(135deg,#2563eb48,#06b6d415)}header span{font-size:10px;letter-spacing:.18em;color:#93c5fd;font-weight:800}header h2{margin:4px 0 0;font-size:23px}header button{border:0;background:#ffffff15;color:#cbd5e1;border-radius:12px;width:38px;height:38px;font-size:25px;cursor:pointer}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#24324a;border-block:1px solid #24324a}.summary div{padding:12px;background:#0e192b;text-align:center}.summary b{display:block;font-size:20px}.summary small{color:#93a4bd}nav{display:flex;gap:3px;padding:9px 12px;border-bottom:1px solid #24324a;overflow:auto}nav button,.filters button{border:0;background:transparent;color:#93a4bd;padding:8px 10px;border-radius:9px;white-space:nowrap;cursor:pointer;font-size:12px;font-weight:700}nav button.active,.filters button.active{background:#1d4ed8;color:#fff}main{flex:1;overflow:auto;padding:14px}.toolbar{display:grid;grid-template-columns:1fr auto;gap:8px}.toolbar label{display:flex;align-items:center;gap:8px;height:42px;padding:0 12px;border:1px solid #24324a;border-radius:12px;background:#0e192b}.toolbar input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:#e8eef9}.toolbar button,.section-title button,.card button,.queue button,.empty button{border:1px solid #24324a;background:#14213a;color:#e8eef9;border-radius:10px;padding:8px 11px;cursor:pointer;font-weight:700}.filters{display:flex;gap:4px;padding:9px 0;overflow:auto}.batch{display:flex;align-items:center;gap:5px;margin-bottom:9px;padding:8px;border:1px solid #1d4ed8;border-radius:11px;background:#2563eb20;font-size:11px}.batch span{margin-right:auto}.batch button{border:0;border-radius:7px;padding:5px 7px;background:#1e3a5f;color:#fff}.list{display:grid;gap:9px}.device,.queue,.card,.guide section{border:1px solid #24324a;border-radius:15px;background:#111c2f;padding:13px}.trusted-device{border-color:#22c55e88}.device-head{display:grid;grid-template-columns:auto 1fr auto;gap:9px}.device-head>div{min-width:0}.title{display:flex;align-items:center;gap:7px}.title strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.device p,.queue p,.card p,.section-title p,.log p{margin:4px 0;color:#93a4bd;font-size:10px}.device code{margin-right:8px;color:#9fb0c8}.icon{border:0;background:transparent;color:#93a4bd;font-size:18px}.badge{border:1px solid var(--c);color:var(--c);border-radius:8px;padding:2px 6px;font-size:9px}.badge.trusted{--c:#22c55e}.badge.unknown{--c:#94a3b8}.tiers{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:12px}.tier{border:1px solid var(--c);border-radius:9px;background:#0f1b2d;color:#eaf2ff;padding:7px 4px;cursor:pointer;font-size:11px;font-weight:800}.actions{display:flex;gap:5px;margin-top:8px}.actions button{flex:1;border:0;border-radius:8px;background:#18263f;color:#aebdd2;padding:6px 4px;font-size:10px}.empty{text-align:center;border:1px dashed #33435d;border-radius:16px;padding:28px 18px;color:#93a4bd}.empty p{font-size:12px;line-height:1.6}.section-title{display:flex;justify-content:space-between;gap:8px;margin-bottom:10px}.queue{display:flex;justify-content:space-between;gap:8px}.queue>div:last-child{display:flex;flex-direction:column;gap:5px}.status{margin-left:6px;padding:2px 5px;border-radius:6px;background:#334155;font-size:9px}.status.pending{background:#7c2d12;color:#fed7aa}.status.prepared{background:#713f12;color:#fde68a}.status.applied{background:#14532d;color:#bbf7d0}.profile-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:9px}.profile{border-top:3px solid var(--c);border-radius:9px;background:#0c1728;padding:9px}.profile label,.field{display:block;margin-top:7px;color:#93a4bd;font-size:9px}.profile input,.field input,.field select{width:100%;margin-top:3px;border:1px solid #24324a;border-radius:7px;background:#111e32;color:#e8eef9;padding:7px}.primary{background:#2563eb!important}.wide{width:100%;margin-top:10px}.switch{display:flex;align-items:flex-start;gap:9px;margin-top:13px}.switch input{display:none}.switch>span{width:36px;height:20px;border-radius:10px;background:#334155;position:relative;flex:none}.switch>span:after{content:"";position:absolute;left:3px;top:3px;width:14px;height:14px;border-radius:50%;background:#fff}.switch input:checked+span{background:#2563eb}.switch input:checked+span:after{left:19px}.switch div{display:grid}.switch small{color:#93a4bd}.two{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:10px}.danger{border-color:#ef444455}.guide{display:grid;gap:10px}.guide p,.guide li{color:#a7b6cb;font-size:12px;line-height:1.65}.guide ol{padding-left:20px}.log{display:flex;gap:9px;border-bottom:1px solid #24324a;padding:8px 2px}.log i{width:8px;height:8px;border-radius:50%;background:#64748b;margin-top:5px}.log.success i{background:#22c55e}.log.warning i{background:#f59e0b}.log small{color:#64748b}footer{display:flex;align-items:center;gap:10px;padding:10px 14px;border-top:1px solid #24324a;background:#0a1423;color:#93a4bd;font-size:10px}footer span{margin-right:auto}footer i{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px}footer i.safe{background:#22c55e}footer i.unsafe{background:#ef4444}footer button{border:0;background:transparent;color:#93c5fd}.toast{position:fixed;right:32px;bottom:30px;max-width:350px;transform:translateY(20px);opacity:0;border:1px solid #334155;border-radius:11px;background:#0f1b2d;color:#fff;padding:11px 14px;box-shadow:0 15px 40px #0006;transition:.18s}.toast.show{transform:none;opacity:1}.toast[data-type="warning"]{border-color:#d97706}.toast[data-type="success"]{border-color:#16a34a}@media(max-width:560px){.panel{right:6px;top:6px;bottom:6px;width:calc(100vw - 12px)}.full-page .panel{inset:0;width:100vw}.profile-grid{grid-template-columns:1fr}.toast{right:15px;left:15px}}
  `;

  function restart() {
    clearInterval(timer);
    timer = setInterval(scanDevices, config.scanSeconds * 1000);
  }

  function init() {
    if (document.getElementById(HOST_ID)) return;
    host = document.createElement('div');
    host.id = HOST_ID;
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${CSS}</style><div class="shell ${config.open ? 'open' : ''}"><button class="bubble" data-action="toggle">JY<b></b></button><aside class="panel"></aside><div class="toast" role="status"></div></div>`;
    document.documentElement.appendChild(host);
    shadow.addEventListener('click', clicked);
    shadow.addEventListener('input', (event) => {
      if (event.target.matches('[data-role="search"]')) { search = event.target.value; render(); }
    });
    shadow.addEventListener('focusout', () => {
      if (renderPending) setTimeout(() => requestRender(), 0);
    });
    shadow.addEventListener('change', (event) => {
      if (event.target.matches('[data-setting]')) settingChanged(event.target);
      if (event.target.matches('[data-role="import-file"]') && event.target.files[0]) importConfig(event.target.files[0]);
    });
    scanDevices();
    resumePendingNative();
    restart();
    const observer = new MutationObserver((records) => {
      if (!records.some((record) => !host.contains(record.target))) return;
      clearTimeout(scanDebounce);
      scanDebounce = setTimeout(scanDevices, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand('打开 TR3000 管理中心', () => { config.open = true; saveConfig(); render(); });
      GM_registerMenuCommand('切换全屏管理台', () => { config.open = true; config.fullPage = !config.fullPage; saveConfig(); render(); });
      GM_registerMenuCommand('扫描当前页面设备', scanDevices);
      GM_registerMenuCommand('打开原生 QoS', openQos);
    }
    addLog('info', `TR3000 管理增强器 v${VERSION} 已启动`, location.pathname);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
