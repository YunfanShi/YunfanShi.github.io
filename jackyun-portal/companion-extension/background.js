import { expectsStructuredAiResponse, hasNewAiResponse, selectAiResponseText } from './ai-response-detection.mjs';

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
const AI_PROVIDER_URLS = {
  chatgpt: 'https://chatgpt.com/', deepseek: 'https://chat.deepseek.com/', claude: 'https://claude.ai/new',
  gemini: 'https://gemini.google.com/app', qwen: 'https://chat.qwen.ai/', perplexity: 'https://www.perplexity.ai/',
};
const COMPANION_BRIDGE_HOSTS = new Set(['jackyun.top', 'jackyun.cn', 'yunfanshi.github.io', ...Object.values(AI_PROVIDER_URLS).map((value) => new URL(value).hostname.replace(/^www\./, ''))]);
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

function supportsCompanionBridge(rawUrl) {
  try {
    const host = new URL(String(rawUrl || '')).hostname.toLowerCase().replace(/^www\./, '');
    return [...COMPANION_BRIDGE_HOSTS].some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch { return false; }
}

async function reinjectCompanionBridge() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.filter((tab) => tab.id && supportsCompanionBridge(tab.url)).map((tab) => chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }).catch(() => null)));
}

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
  const platform = /Edg\//.test(navigator.userAgent) ? 'edge' : 'chrome';
  const previous = stored.device && typeof stored.device === 'object' ? stored.device : {};
  const device = {
    ...previous,
    id: previous.id || uuid(),
    name: previous.name || `${platform === 'edge' ? 'Edge' : 'Chrome'} · ${navigator.platform || 'Computer'}`,
    platform,
    browserVersion: navigator.userAgent.slice(0, 80),
    extensionVersion: VERSION,
  };
  if (JSON.stringify(device) !== JSON.stringify(previous)) await local.set({ device });
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

async function betaAiLog(type, details = {}) {
  const stored = await local.get(['betaAiLogs']);
  const logs = Array.isArray(stored.betaAiLogs) ? stored.betaAiLogs : [];
  logs.push({ at: new Date().toISOString(), type, ...details });
  await local.set({ betaAiLogs: logs.slice(-100) });
}

async function waitForTab(tabId, payload = null, portalTabId = null) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === 'complete') return;
    if (payload && attempt > 0 && attempt % 8 === 0) await notifyAiStatus(portalTabId, payload, 'opening', `AI 网页仍在加载（${Math.round(attempt / 4)} 秒）…`);
    await delay(250);
  }
  throw new Error('AI 网页加载超时');
}

function isConversationUrl(provider, rawUrl) {
  try {
    const url = new URL(providerConversationUrl(provider, rawUrl));
    const patterns = {
      chatgpt: /^\/c\/[\w-]+/, deepseek: /^\/a\/chat\/s\/[\w-]+/, claude: /^\/chat\/[\w-]+/,
      gemini: /^\/app\/[\w-]+/, qwen: /^\/(?:c|chat)\/[\w-]+/, perplexity: /^\/search\/[\w-]+/,
    };
    return patterns[provider]?.test(url.pathname) === true;
  } catch { return false; }
}

function providerConversationUrl(provider, rawUrl) {
  const base = AI_PROVIDER_URLS[provider];
  if (!base) throw new Error('不支持的 AI 提供方');
  if (!String(rawUrl || '').trim()) throw new Error('请先选择要继续的对话');
  const expected = new URL(base);
  const candidate = new URL(String(rawUrl || ''), expected);
  if (candidate.protocol !== 'https:' || candidate.origin !== expected.origin) throw new Error('所选对话链接不属于当前 AI 提供方');
  return candidate.href;
}

async function listAiConversations(provider) {
  const base = AI_PROVIDER_URLS[String(provider || '')];
  if (!base) return { conversations: [], providerOpen: false };
  const target = new URL(base);
  const tabs = await chrome.tabs.query({ url: `${target.origin}/*` });
  const conversations = tabs
    .filter((tab) => tab.id && tab.url && isConversationUrl(provider, tab.url))
    .sort((left, right) => Number(right.lastAccessed || 0) - Number(left.lastAccessed || 0))
    .map((tab) => ({ title: String(tab.title || `${target.hostname} 对话`).slice(0, 160), url: providerConversationUrl(provider, tab.url), active: Boolean(tab.active) }));
  return { conversations, providerOpen: tabs.length > 0 };
}

async function jackYunConversationUrl(provider) {
  const stored = await local.get(['browserAiJackYunConversations']);
  const conversations = stored.browserAiJackYunConversations && typeof stored.browserAiJackYunConversations === 'object' ? stored.browserAiJackYunConversations : {};
  const url = String(conversations[provider] || '');
  return isConversationUrl(provider, url) ? providerConversationUrl(provider, url) : '';
}

async function rememberJackYunConversation(provider, tabId) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab?.url && isConversationUrl(provider, tab.url)) {
      const stored = await local.get(['browserAiJackYunConversations']);
      const conversations = stored.browserAiJackYunConversations && typeof stored.browserAiJackYunConversations === 'object' ? stored.browserAiJackYunConversations : {};
      await local.set({ browserAiJackYunConversations: { ...conversations, [provider]: providerConversationUrl(provider, tab.url) } });
      return;
    }
    await delay(250);
  }
}

async function ensureAiPageReady(tabId, payload = null, portalTabId = null) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = await chrome.tabs.sendMessage(tabId, { type: 'AI_PAGE_STATUS' }).catch(() => null);
    if (current?.ok) return;
    await delay(250);
  }
  if (payload) await notifyAiStatus(portalTabId, payload, 'opening', '正在重新加载旧标签页以连接最新版 Companion…');
  await chrome.tabs.reload(tabId);
  await waitForTab(tabId, payload, portalTabId);
  const retry = await chrome.tabs.sendMessage(tabId, { type: 'AI_PAGE_STATUS' }).catch(() => null);
  if (!retry?.ok) throw new Error('AI 网页未连接到 Companion，请在扩展管理页重新加载最新版后重试');
}

async function listAiModels(provider) {
  const base = AI_PROVIDER_URLS[String(provider || '')];
  if (!base) return [];
  const target = new URL(base);
  const tabs = await chrome.tabs.query({ url: `${target.origin}/*` });
  let tab = [...tabs].sort((left, right) => Number(right.lastAccessed || 0) - Number(left.lastAccessed || 0))[0];
  if (!tab) tab = await chrome.tabs.create({ url: target.href, active: true });
  if (!tab?.id) throw new Error('无法打开 AI 网页来读取模型');
  await waitForTab(tab.id);
  await ensureAiPageReady(tab.id);
  const response = await chrome.tabs.sendMessage(tab.id, { type: 'AI_LIST_MODELS' });
  if (!response?.ok) throw new Error(response?.error || '未能读取当前账号的模型');
  return Array.isArray(response.models) ? response.models : [];
}

async function notifyAiStatus(portalTabId, payload, stage, detail, extra = {}) {
  const stored = await local.get(['currentAiAutomation']);
  const previous = stored.currentAiAutomation?.requestId === payload.requestId ? stored.currentAiAutomation : null;
  const current = {
    requestId: String(payload.requestId || ''), provider: String(payload.provider || ''), stage, detail,
    error: String(extra.error || ''), startedAt: previous?.startedAt || Date.now(), updatedAt: Date.now(),
  };
  await local.set({ currentAiAutomation: current });
  const aiTabId = Number(payload?.aiTabId || 0);
  if (aiTabId > 0) {
    await chrome.tabs.sendMessage(aiTabId, {
      type: 'AI_AUTOMATION_STATUS', requestId: current.requestId, provider: current.provider,
      stage, startedAt: current.startedAt,
    }).catch(() => {});
  }
  if (portalTabId) await chrome.tabs.sendMessage(portalTabId, { type: 'AI_AUTOMATION_STATUS', requestId: payload.requestId, stage, detail, ...extra }).catch(() => {});
}

async function waitForAiReply(tabId, baselineCount, baselineText, payload, portalTabId) {
  let previous = '';
  let stablePolls = 0;
  const preserveStructured = expectsStructuredAiResponse(payload.prompt);
  for (let attempt = 0; attempt < 300; attempt += 1) {
    await delay(1000);
    const state = await chrome.tabs.sendMessage(tabId, { type: 'AI_READ_RESPONSE', provider: payload.provider }).catch(() => null);
    if (!state?.ok) {
      if (attempt % 5 === 4) await notifyAiStatus(portalTabId, payload, 'waiting', `已等待 ${attempt + 1} 秒，正在重新连接 AI 页面…`);
      continue;
    }
    const text = selectAiResponseText(state, preserveStructured);
    const hasNewResponse = hasNewAiResponse(state, baselineCount, baselineText);
    if (!hasNewResponse) {
      if (attempt % 5 === 4) await notifyAiStatus(portalTabId, payload, 'waiting', `已等待 ${attempt + 1} 秒；页面可见 ${Number(state.count || 0)} 条回复，最新 ${text.length} 个字符，正在识别新增内容…`);
      continue;
    }
    stablePolls = text === previous && !state.busy ? stablePolls + 1 : 0;
    previous = text;
    if (stablePolls >= 2) return text;
    if (attempt % 5 === 0) await notifyAiStatus(portalTabId, payload, 'receiving', `已收到 ${text.length} 个字符，正在等待回复完成（${attempt + 1} 秒）…`);
  }
  throw new Error('等待 AI 回复超时，请在手动模式中粘贴回复');
}

async function sendPromptToAiWebsite(payload, portalTabId) {
  const provider = String(payload?.provider || '');
  const prompt = String(payload?.prompt || '');
  if (!AI_PROVIDER_URLS[provider] || !prompt || prompt.length > 500000) throw new Error('无效的 AI Prompt 请求');
  const eligibility = await api('/beta');
  if (!eligibility.betaActive) {
    await betaAiLog('eligibility_denied', { provider });
    throw new Error('当前账户没有 BETA 资格');
  }
  const target = new URL(AI_PROVIDER_URLS[provider]);
  const matches = await chrome.tabs.query({ url: `${target.origin}/*` });
  await notifyAiStatus(portalTabId, payload, 'opening', matches.length ? 'AI 网站已打开，正在连接…' : '首次启动：正在打开 AI 网站，登录和页面加载可能需要更久…');
  const conversationMode = ['recent', 'selected', 'jackyun'].includes(payload?.conversationMode) ? payload.conversationMode : 'new';
  let destination = target.href;
  let tab = null;
  let continuesConversation = false;
  if (conversationMode === 'jackyun') {
    const savedUrl = await jackYunConversationUrl(provider);
    if (savedUrl) {
      destination = savedUrl;
      tab = matches.find((item) => item.url === destination) || null;
      continuesConversation = true;
    }
  } else if (conversationMode === 'selected') {
    destination = providerConversationUrl(provider, payload?.conversationUrl);
    if (!isConversationUrl(provider, destination)) throw new Error('所选标签页不是有效对话，请重新识别并选择');
    tab = matches.find((item) => item.url === destination) || null;
    continuesConversation = true;
  } else if (conversationMode === 'recent') {
    tab = [...matches].filter((item) => item.url && isConversationUrl(provider, item.url)).sort((left, right) => Number(right.lastAccessed || 0) - Number(left.lastAccessed || 0))[0] || null;
    if (tab?.url) { destination = providerConversationUrl(provider, tab.url); continuesConversation = true; }
    else await notifyAiStatus(portalTabId, payload, 'opening', '没有找到已打开的真实对话，将改为新建对话…');
  }
  tab = tab || await chrome.tabs.create({ url: destination, active: true });
  if (!tab.id) throw new Error('无法打开 AI 网页');
  payload.aiTabId = tab.id;
  await chrome.tabs.update(tab.id, { active: true });
  await delay(150);
  await waitForTab(tab.id, payload, portalTabId);
  await ensureAiPageReady(tab.id, payload, portalTabId);
  await notifyAiStatus(portalTabId, payload, 'opening', 'AI 网站已连接，正在准备自动处理…');
  if (String(payload?.model || '').trim()) {
    await notifyAiStatus(portalTabId, payload, 'filling', `正在切换到模型“${String(payload.model).slice(0, 80)}”…`);
    const switched = await chrome.tabs.sendMessage(tab.id, { type: 'AI_SELECT_MODEL', model: String(payload.model) });
    if (!switched?.ok) throw new Error(switched?.error || '模型切换失败');
  }
  await notifyAiStatus(portalTabId, payload, 'filling', continuesConversation ? `已进入对话“${String(tab.title || provider).slice(0, 60)}”，正在继续上下文…` : '新对话已打开，正在填写消息…');
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'AI_FILL_PROMPT', prompt, provider, submit: true });
      if (response?.ok) {
        if (conversationMode === 'jackyun' && !continuesConversation) await rememberJackYunConversation(provider, tab.id);
        await betaAiLog('prompt_submitted', { provider, conversationMode, requestId: payload.requestId, tabId: tab.id });
        await notifyAiStatus(portalTabId, payload, 'waiting', '消息已发送，正在等待 AI 完成回复…');
        const reply = await waitForAiReply(tab.id, response.baselineCount, response.baselineText, payload, portalTabId);
        await betaAiLog('reply_received', { provider, requestId: payload.requestId, tabId: tab.id, replyLength: reply.length });
        await notifyAiStatus(portalTabId, payload, 'complete', '回复已完整收到，正在返回 JackYun…', { reply });
        await chrome.tabs.update(portalTabId, { active: true }).catch(() => {});
        return { tabId: tab.id, provider, reply };
      }
      lastError = new Error(response?.error || 'AI 输入框尚未就绪');
    } catch (error) { lastError = error; }
    await delay(750);
  }
  await betaAiLog('prompt_failed', { provider, requestId: payload.requestId, error: lastError?.message || String(lastError) });
  throw lastError || new Error('无法填写 AI 网页');
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
  const [stored, current, device, prefs] = await Promise.all([local.get(['activity', 'lastSyncAt', 'lastSyncError', 'refreshToken', 'focus', 'currentAiAutomation']), session.get(['accessToken']), getDevice(), preferences()]);
  const todayRows = Object.values(stored.activity || {}).filter((item) => item.activityDate === day());
  return { signedIn: Boolean(stored.refreshToken || current.accessToken), device, preferences: prefs, todaySeconds: todayRows.reduce((sum, item) => sum + Number(item.activeSeconds || 0), 0), sites: todayRows.sort((a, b) => b.activeSeconds - a.activeSeconds), lastSyncAt: stored.lastSyncAt || 0, lastSyncError: stored.lastSyncError || '', focus: stored.focus || null, automation: { available: true, version: VERSION, providers: Object.keys(AI_PROVIDER_URLS), current: stored.currentAiAutomation || null } };
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
  reinjectCompanionBridge().catch((error) => local.set({ bridgeInjectionError: error.message || String(error) }));
  getDevice().then(() => syncNow()).catch((error) => local.set({ lastSyncError: error.message || String(error) }));
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
    if (message.type === 'AI_LIST_CONVERSATIONS') return listAiConversations(message.provider);
    if (message.type === 'AI_LIST_MODELS') return listAiModels(message.provider);
    if (message.type === 'AI_WEB_PROMPT') {
      try { return await sendPromptToAiWebsite(message.payload, sender.tab?.id); }
      catch (error) {
        await notifyAiStatus(sender.tab?.id, message.payload || {}, 'error', '自动处理未完成。', { error: error.message || String(error) });
        throw error;
      }
    }
    if (message.type === 'BETA_AI_LOGS') { const stored = await local.get(['betaAiLogs']); return stored.betaAiLogs || []; }
    if (message.type === 'OPEN_ONBOARDING') return chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
    if (message.type === 'ONBOARDING_COMPLETE') { await local.set({ onboardingSeen: true }); return true; }
    return null;
  })().then((result) => sendResponse({ ok: true, result })).catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});
