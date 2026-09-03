const PORTAL = 'https://jackyun.top';
const VERSION = chrome.runtime.getManifest().version;
const DEFAULT_PREFERENCES = { enabled: true, countAI: true, idleSeconds: 60, goalMinutes: 120, retentionDays: 365, savePageTitles: false };
const DEFAULT_SAFEGUARD = {
  enabled: true,
  blockChinese: true,
  excludeEducation: true,
  translationGraceMinutes: 2,
  translatedSessionMinutes: 60,
  studySessionMinutes: 30,
  activeCategories: { Pornography: true, Videos: false, Novels: false, Gaming: false, Social: false },
  customSites: [],
  customEducationHosts: [],
  customEntertainmentHosts: [],
};
const DEFAULT_TOOLS = {
  cleanTrackingLinks: true,
  znotesQuizHelper: true,
  bestExamDownloads: true,
  discordImageShield: false,
  timezoneBadges: false,
};
const DEFAULT_ADBLOCK = {
  enabled: true,
  privacy: true,
  cosmetic: true,
  siteAllowlist: [],
};
const ADBLOCK_ALLOW_RULE_START = 200000;
const ADBLOCK_RESOURCE_TYPES = ['sub_frame', 'script', 'image', 'stylesheet', 'object', 'xmlhttprequest', 'ping', 'media', 'font', 'websocket', 'other'];
const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  supabaseUrl: 'https://gdcwwlnzylrzrqhaaljq.supabase.co',
  oauthClientId: '8d65c941-79c0-4678-af1f-e0699ef700aa',
  apiVersion: 1,
});

const local = {
  async get(keys) { return chrome.storage.local.get(keys); },
  async set(value) { return chrome.storage.local.set(value); },
  async remove(keys) { return chrome.storage.local.remove(keys); },
};
const session = {
  async get(keys) { return chrome.storage.session.get(keys); },
  async set(value) { return chrome.storage.session.set(value); },
  async remove(keys) { return chrome.storage.session.remove(keys); },
};

function day() { return new Date().toLocaleDateString('en-CA'); }
function uuid() { return crypto.randomUUID(); }
function base64url(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
async function sha256(value) { return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))); }

function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

async function fetchWithRetry(input, options = {}, attempts = 3) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(input, { ...options, signal: controller.signal });
      if (response.status < 500 || attempt === attempts - 1) return response;
      lastError = new Error(`服务器暂时不可用（${response.status}）`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
    await delay(400 * 2 ** attempt);
  }
  throw lastError || new Error('网络连接失败');
}

function usableConfig(value) {
  return Boolean(value && typeof value === 'object' && typeof value.supabaseUrl === 'string' && value.supabaseUrl.startsWith('https://') && typeof value.oauthClientId === 'string' && value.oauthClientId.length > 10);
}

async function getConfig() {
  const cached = await local.get(['config', 'configAt']);
  if (usableConfig(cached.config) && Date.now() - Number(cached.configAt || 0) < 300000) return cached.config;
  try {
    const response = await fetchWithRetry(`${PORTAL}/api/companion/config`);
    if (response.ok) {
      const remote = await response.json();
      if (usableConfig(remote)) {
        const config = { ...DEFAULT_CONFIG, ...remote };
        await local.set({ config, configAt: Date.now() });
        return config;
      }
    }
  } catch { /* The public bundled config keeps first-run login available offline. */ }
  const config = usableConfig(cached.config) ? { ...DEFAULT_CONFIG, ...cached.config } : { ...DEFAULT_CONFIG };
  await local.set({ config, configAt: Date.now(), configFallback: true });
  return config;
}

async function getDevice() {
  const stored = await local.get(['device']);
  if (stored.device?.id) return stored.device;
  const platform = /Edg\//.test(navigator.userAgent) ? 'edge' : 'chrome';
  const device = { id: uuid(), name: `${platform === 'edge' ? 'Edge' : 'Chrome'} · ${navigator.platform || 'Computer'}`, platform, browserVersion: navigator.userAgent.slice(0, 80), extensionVersion: VERSION };
  await local.set({ device });
  return device;
}

async function refreshSession() {
  const config = await getConfig();
  const stored = await local.get(['refreshToken']);
  if (!stored.refreshToken) return null;
  const response = await fetchWithRetry(`${config.supabaseUrl}/auth/v1/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: stored.refreshToken, client_id: config.oauthClientId }),
  });
  if (!response.ok) { await signOut(); return null; }
  const tokens = await response.json();
  await session.set({ accessToken: tokens.access_token, expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000 });
  if (tokens.refresh_token) await local.set({ refreshToken: tokens.refresh_token });
  return tokens.access_token;
}

async function getAccessToken() {
  const current = await session.get(['accessToken', 'expiresAt']);
  if (current.accessToken && Number(current.expiresAt) - Date.now() > 60000) return current.accessToken;
  return refreshSession();
}

async function signIn() {
  const config = await getConfig();
  if (!config.enabled || !config.oauthClientId || !config.supabaseUrl) throw new Error('管理员尚未启用 Companion OAuth');
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = base64url(await sha256(verifier));
  const state = base64url(crypto.getRandomValues(new Uint8Array(24)));
  const redirectUri = chrome.identity.getRedirectURL('oauth2');
  const authorize = new URL(`${config.supabaseUrl}/auth/v1/oauth/authorize`);
  authorize.search = new URLSearchParams({ response_type: 'code', client_id: config.oauthClientId, redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: 'S256', state, scope: 'openid email profile' }).toString();
  const callback = await chrome.identity.launchWebAuthFlow({ url: authorize.toString(), interactive: true });
  if (!callback) throw new Error('登录已取消');
  const returned = new URL(callback);
  if (returned.searchParams.get('state') !== state) throw new Error('登录状态验证失败');
  const code = returned.searchParams.get('code');
  if (!code) throw new Error(returned.searchParams.get('error_description') || '未收到授权码');
  const tokenResponse = await fetchWithRetry(`${config.supabaseUrl}/auth/v1/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: config.oauthClientId, code_verifier: verifier }),
  });
  if (!tokenResponse.ok) throw new Error('无法交换登录令牌');
  const tokens = await tokenResponse.json();
  await session.set({ accessToken: tokens.access_token, expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000 });
  await local.set({ refreshToken: tokens.refresh_token, signedInAt: Date.now() });
  try { await syncNow(); } catch (error) { await local.set({ lastSyncError: error.message || String(error) }); }
  return true;
}

async function signOut() {
  await session.remove(['accessToken', 'expiresAt']);
  await local.remove(['refreshToken', 'signedInAt']);
}

async function preferences() {
  const stored = await local.get(['preferences']);
  return { ...DEFAULT_PREFERENCES, ...(stored.preferences || {}) };
}

function normalizeHostList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/:?#]/)[0]).filter(Boolean))].slice(0, 500);
}

async function safeguardConfig() {
  const stored = await local.get(['safeguard']);
  const raw = stored.safeguard && typeof stored.safeguard === 'object' ? stored.safeguard : {};
  return {
    ...DEFAULT_SAFEGUARD,
    ...raw,
    activeCategories: { ...DEFAULT_SAFEGUARD.activeCategories, ...(raw.activeCategories || {}) },
    customSites: Array.isArray(raw.customSites) ? raw.customSites.slice(0, 1000) : [],
    customEducationHosts: normalizeHostList(raw.customEducationHosts),
    customEntertainmentHosts: normalizeHostList(raw.customEntertainmentHosts),
  };
}

async function saveSafeguardConfig(value) {
  const current = await safeguardConfig();
  const next = {
    ...current,
    ...(value && typeof value === 'object' ? value : {}),
    activeCategories: { ...current.activeCategories, ...(value?.activeCategories || {}) },
    customEducationHosts: normalizeHostList(value?.customEducationHosts ?? current.customEducationHosts),
    customEntertainmentHosts: normalizeHostList(value?.customEntertainmentHosts ?? current.customEntertainmentHosts),
  };
  await local.set({ safeguard: next });
  return next;
}

async function toolsConfig() {
  const stored = await local.get(['tools']);
  return { ...DEFAULT_TOOLS, ...(stored.tools || {}) };
}

async function saveToolsConfig(value) {
  const current = await toolsConfig();
  const next = Object.fromEntries(Object.keys(DEFAULT_TOOLS).map((key) => [key, value?.[key] ?? current[key]]));
  await local.set({ tools: next });
  return next;
}

function normalizeAdblockHost(value) {
  return String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/:?#]/)[0];
}

function normalizeAdblockConfig(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const siteAllowlist = Array.isArray(raw.siteAllowlist)
    ? [...new Set(raw.siteAllowlist.map(normalizeAdblockHost).filter((host) => host.includes('.') && host.length <= 253))].slice(0, 100)
    : [];
  return {
    enabled: raw.enabled !== false,
    privacy: raw.privacy !== false,
    cosmetic: raw.cosmetic !== false,
    siteAllowlist,
  };
}

async function adblockConfig() {
  const stored = await local.get(['adblock']);
  return normalizeAdblockConfig({ ...DEFAULT_ADBLOCK, ...(stored.adblock || {}) });
}

async function applyAdblockRules(config) {
  const enabledRulesets = config.enabled ? ['ads_core', ...(config.privacy ? ['privacy_strict'] : [])] : [];
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: enabledRulesets,
    disableRulesetIds: ['ads_core', 'privacy_strict'].filter((id) => !enabledRulesets.includes(id)),
  });
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map((rule) => rule.id).filter((id) => id >= ADBLOCK_ALLOW_RULE_START && id < ADBLOCK_ALLOW_RULE_START + 100);
  const addRules = config.enabled ? config.siteAllowlist.map((host, index) => ({
    id: ADBLOCK_ALLOW_RULE_START + index,
    priority: 100,
    action: { type: 'allow' },
    condition: { initiatorDomains: [host], resourceTypes: ADBLOCK_RESOURCE_TYPES },
  })) : [];
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
}

async function saveAdblockConfig(value) {
  const current = await adblockConfig();
  const next = normalizeAdblockConfig({ ...current, ...(value && typeof value === 'object' ? value : {}) });
  await local.set({ adblock: next });
  await applyAdblockRules(next);
  return next;
}

function sessionKey(hostname) {
  const normalized = String(hostname || '').trim().toLowerCase().replace(/^www\./, '');
  return normalized ? `safeguard:${normalized}` : null;
}

async function getSafeguardSession(hostname) {
  const key = sessionKey(hostname);
  if (!key) return null;
  const stored = await session.get([key]);
  const value = stored[key];
  if (!value || Number(value.expiresAt) <= Date.now()) {
    await session.remove([key]);
    return null;
  }
  return value;
}

async function setSafeguardSession(payload) {
  const key = sessionKey(payload?.hostname);
  const mode = String(payload?.mode || '');
  const expiresAt = Number(payload?.expiresAt || 0);
  if (!key || !['translate', 'translated', 'study'].includes(mode) || expiresAt <= Date.now()) throw new Error('Invalid SafeGuard session');
  const value = { mode, expiresAt: Math.min(expiresAt, Date.now() + 4 * 60 * 60 * 1000) };
  await session.set({ [key]: value });
  return value;
}

async function recordActivity(payload) {
  const prefs = await preferences();
  if (!prefs.enabled || (payload.category === 'AI 助手' && !prefs.countAI)) return;
  const idleState = await chrome.idle.queryState(Math.max(30, Number(prefs.idleSeconds || 60)));
  if (idleState !== 'active') return;
  const stored = await local.get(['activity']);
  const activity = stored.activity || {};
  const key = `${day()}|${payload.hostname}`;
  const current = activity[key] || { activityDate: day(), resourceKey: payload.hostname, hostname: payload.hostname, category: payload.category, activeSeconds: 0, visits: 0 };
  current.activeSeconds = Math.min(86400, current.activeSeconds + Math.max(0, Number(payload.seconds || 0)));
  current.visits = Math.min(10000, current.visits + Math.max(0, Number(payload.visits || 0)));
  activity[key] = current;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - prefs.retentionDays);
  for (const [activityKey, item] of Object.entries(activity)) if (item.activityDate < cutoff.toLocaleDateString('en-CA')) delete activity[activityKey];
  await local.set({ activity });
}

async function api(path, options = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error('请先登录');
  const response = await fetchWithRetry(`${PORTAL}/api/companion${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  if (response.status === 401) { await session.remove(['accessToken', 'expiresAt']); throw new Error('登录已过期，请重试'); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || '同步失败');
  return result;
}

async function syncNow() {
  const [device, stored] = await Promise.all([getDevice(), local.get(['activity', 'pendingFocus', 'preferencesDirty'])]);
  let prefs = await preferences();
  if (!stored.preferencesDirty) {
    const cloud = await api('/sync');
    if (cloud.preferences && typeof cloud.preferences === 'object') {
      prefs = { ...DEFAULT_PREFERENCES, ...cloud.preferences };
      await local.set({ preferences: prefs });
    }
  }
  const result = await api('/sync', { method: 'POST', body: JSON.stringify({ device, activities: Object.values(stored.activity || {}), focusSessions: stored.pendingFocus || [], preferences: prefs }) });
  await local.set({ lastSyncAt: Date.now(), lastSyncError: '', pendingFocus: [], preferencesDirty: false });
  return result;
}

async function getStatus() {
  const [stored, current, device, prefs] = await Promise.all([local.get(['activity', 'lastSyncAt', 'lastSyncError', 'refreshToken', 'focus']), session.get(['accessToken']), getDevice(), preferences()]);
  const todayRows = Object.values(stored.activity || {}).filter((item) => item.activityDate === day());
  return { signedIn: Boolean(stored.refreshToken || current.accessToken), device, preferences: prefs, todaySeconds: todayRows.reduce((sum, item) => sum + Number(item.activeSeconds || 0), 0), sites: todayRows.sort((a, b) => b.activeSeconds - a.activeSeconds), lastSyncAt: stored.lastSyncAt || 0, lastSyncError: stored.lastSyncError || '', focus: stored.focus || null };
}

async function startFocus(minutes) {
  const focus = { id: uuid(), minutes, startedAt: new Date().toISOString(), endsAt: Date.now() + minutes * 60000 };
  await local.set({ focus });
  chrome.alarms.create('focus-complete', { when: focus.endsAt });
  return focus;
}

async function importLiteData(payload) {
  if (!payload || typeof payload !== 'object' || !payload.daily || typeof payload.daily !== 'object') throw new Error('不是有效的 Companion Lite 备份');
  const stored = await local.get(['activity']);
  const activity = stored.activity || {};
  let imported = 0;
  for (const [activityDate, record] of Object.entries(payload.daily).slice(-365)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(activityDate) || !record?.sites || typeof record.sites !== 'object') continue;
    for (const [rawHost, rawSeconds] of Object.entries(record.sites).slice(0, 200)) {
      const hostname = String(rawHost).trim().toLowerCase().replace(/^www\./, '');
      const seconds = Math.min(86400, Math.max(0, Math.round(Number(rawSeconds) || 0)));
      if (!hostname || !seconds) continue;
      const key = `${activityDate}|${hostname}`;
      const current = activity[key] || { activityDate, resourceKey: hostname, hostname, category: '其他学习', activeSeconds: 0, visits: 0 };
      // Max makes retrying the same Lite backup idempotent.
      current.activeSeconds = Math.max(Number(current.activeSeconds || 0), seconds);
      activity[key] = current;
      imported += 1;
    }
  }
  const currentPreferences = await preferences();
  const liteSettings = payload.settings && typeof payload.settings === 'object' ? payload.settings : {};
  const nextPreferences = {
    ...currentPreferences,
    enabled: liteSettings.enabled !== false,
    countAI: liteSettings.countAI !== false,
    goalMinutes: Math.min(1440, Math.max(10, Math.round(Number(liteSettings.goalMinutes) || currentPreferences.goalMinutes))),
    idleSeconds: [30, 60, 120, 300].includes(Number(liteSettings.idleSeconds)) ? Number(liteSettings.idleSeconds) : currentPreferences.idleSeconds,
  };
  await local.set({ activity, preferences: nextPreferences, preferencesDirty: true, liteImportedAt: Date.now() });
  return { imported };
}

chrome.runtime.onInstalled.addListener((details) => {
  chrome.alarms.create('companion-sync', { periodInMinutes: 5 });
  getDevice();
  adblockConfig().then(async (config) => {
    await local.set({ adblock: config });
    await applyAdblockRules(config);
    if (details.reason === 'install') {
      await local.set({ onboardingSeen: false });
      await chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
    }
  }).catch((error) => local.set({ adblockError: error.message || String(error) }));
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('companion-sync', { periodInMinutes: 5 });
  adblockConfig().then(applyAdblockRules).catch((error) => local.set({ adblockError: error.message || String(error) }));
});
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'companion-sync') {
    try { await syncNow(); } catch (error) { await local.set({ lastSyncError: error.message || String(error) }); }
  }
  if (alarm.name === 'focus-complete') {
    const stored = await local.get(['focus', 'pendingFocus']);
    if (!stored.focus) return;
    const completedAt = new Date().toISOString();
    const entry = { id: stored.focus.id, durationSeconds: stored.focus.minutes * 60, startedAt: stored.focus.startedAt, completedAt };
    await local.set({ focus: null, pendingFocus: [...(stored.pendingFocus || []), entry] });
    chrome.notifications.create({ type: 'basic', iconUrl: 'icon128.png', title: 'JackYun 专注完成', message: `已完成 ${stored.focus.minutes} 分钟专注。` });
    try { await syncNow(); } catch { /* Offline queue is retained. */ }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === 'ACTIVITY') return recordActivity(message.payload);
    if (message.type === 'SIGN_IN') return signIn();
    if (message.type === 'SIGN_OUT') return signOut();
    if (message.type === 'STATUS') return getStatus();
    if (message.type === 'SYNC') return syncNow();
    if (message.type === 'START_FOCUS') return startFocus(Number(message.minutes) === 50 ? 50 : 25);
    if (message.type === 'STOP_FOCUS') { await local.set({ focus: null }); chrome.alarms.clear('focus-complete'); return true; }
    if (message.type === 'SAVE_PREFERENCES') { const next = { ...DEFAULT_PREFERENCES, ...message.preferences }; await local.set({ preferences: next, preferencesDirty: true }); return next; }
    if (message.type === 'SAVE_PAGE') return api('/learning-queue', { method: 'POST', body: JSON.stringify(message.page) });
    if (message.type === 'GET_QUEUE') return api('/learning-queue');
    if (message.type === 'IMPORT_LITE') return importLiteData(message.payload);
    if (message.type === 'SAFEGUARD_GET_CONFIG') return safeguardConfig();
    if (message.type === 'SAFEGUARD_SAVE_CONFIG') return saveSafeguardConfig(message.payload);
    if (message.type === 'SAFEGUARD_GET_SESSION') return getSafeguardSession(message.hostname);
    if (message.type === 'SAFEGUARD_SET_SESSION') return setSafeguardSession(message.payload);
    if (message.type === 'TOOLS_GET_CONFIG') return toolsConfig();
    if (message.type === 'TOOLS_SAVE_CONFIG') return saveToolsConfig(message.payload);
    if (message.type === 'ADBLOCK_GET_CONFIG') return adblockConfig();
    if (message.type === 'ADBLOCK_SAVE_CONFIG') return saveAdblockConfig(message.payload);
    if (message.type === 'OPEN_ONBOARDING') return chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
    if (message.type === 'ONBOARDING_COMPLETE') { await local.set({ onboardingSeen: true }); return true; }
    return null;
  })().then((result) => sendResponse({ ok: true, result })).catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});
