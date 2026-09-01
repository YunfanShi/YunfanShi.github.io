const $ = (selector) => document.querySelector(selector);
const send = (message) => chrome.runtime.sendMessage(message).then((response) => { if (!response?.ok) throw new Error(response?.error || '操作失败'); return response.result; });
let status = null;
let currentTab = null;
let safeguard = null;
let tools = null;
function minutes(seconds) { return Math.round(Number(seconds || 0) / 60); }
function notice(text, error = false) { $('#notice').textContent = text; $('#notice').style.color = error ? '#b3261e' : '#1967d2'; }
async function render() {
  [status, safeguard, tools] = await Promise.all([send({ type: 'STATUS' }), send({ type: 'SAFEGUARD_GET_CONFIG' }), send({ type: 'TOOLS_GET_CONFIG' })]);
  $('#sg-enabled').checked = safeguard.enabled;
  $('#sg-chinese').checked = safeguard.blockChinese;
  $('#sg-education-exempt').checked = safeguard.excludeEducation !== false;
  $('#sg-porn').checked = Boolean(safeguard.activeCategories?.Pornography);
  $('#sg-videos').checked = Boolean(safeguard.activeCategories?.Videos);
  $('#sg-novels').checked = Boolean(safeguard.activeCategories?.Novels);
  $('#sg-gaming').checked = Boolean(safeguard.activeCategories?.Gaming);
  $('#sg-social').checked = Boolean(safeguard.activeCategories?.Social);
  $('#sg-grace').value = safeguard.translationGraceMinutes;
  $('#sg-study').value = safeguard.studySessionMinutes;
  $('#sg-education').value = (safeguard.customEducationHosts || []).join('\n');
  $('#sg-entertainment').value = (safeguard.customEntertainmentHosts || []).join('\n');
  $('#tool-clean-links').checked = tools.cleanTrackingLinks;
  $('#tool-znotes').checked = tools.znotesQuizHelper;
  $('#tool-bestexam').checked = tools.bestExamDownloads;
  $('#tool-image-shield').checked = tools.discordImageShield;
  $('#tool-timezone').checked = tools.timezoneBadges;
  renderSafeguardSites();
  $('#signed-in').hidden = !status.signedIn;
  $('#signed-out').hidden = status.signedIn;
  $('#sync-state').textContent = status.signedIn ? (status.lastSyncAt ? `已同步 · ${new Date(status.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '等待首次同步') : '尚未登录';
  if (!status.signedIn) return;
  $('#today').textContent = `${minutes(status.todaySeconds)} 分钟`;
  $('#goal-label').textContent = `${status.preferences.goalMinutes} 分钟`;
  $('#site-count').textContent = `${status.sites.length} 个网站`;
  $('#progress').style.width = `${Math.min(100, status.todaySeconds / (status.preferences.goalMinutes * 60) * 100)}%`;
  $('#device').textContent = status.device.name;
  $('#enabled').checked = status.preferences.enabled;
  $('#count-ai').checked = status.preferences.countAI;
  $('#goal').value = status.preferences.goalMinutes;
  $('#idle').value = String(status.preferences.idleSeconds);
  const sites = $('#sites'); sites.replaceChildren();
  for (const item of status.sites.slice(0, 5)) { const row = document.createElement('div'); row.className = 'site'; const name = document.createElement('span'); name.textContent = item.hostname; const time = document.createElement('time'); time.textContent = `${minutes(item.activeSeconds)}m`; row.append(name, time); sites.append(row); }
  if (!status.sites.length) sites.textContent = '今天还没有有效学习记录。';
  $('#focus-state').textContent = status.focus ? `进行中 · ${Math.max(0, Math.ceil((status.focus.endsAt - Date.now()) / 60000))} 分钟后完成` : '尚未开始';
  [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $('#current-page').textContent = currentTab?.title || '未检测到页面';
}
document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('[data-tab]').forEach((item) => item.classList.toggle('active', item === button));
  document.querySelectorAll('[data-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === button.dataset.tab));
}));
$('#sign-in').addEventListener('click', async () => { try { notice('正在打开安全登录…'); await send({ type: 'SIGN_IN' }); await render(); notice('登录成功'); } catch (error) { notice(error.message, true); } });
$('#sign-out').addEventListener('click', async () => { await send({ type: 'SIGN_OUT' }); await render(); notice('已退出'); });
$('#sync').addEventListener('click', async () => { try { notice('正在同步…'); await send({ type: 'SYNC' }); await render(); notice('同步完成'); } catch (error) { notice(error.message, true); } });
document.querySelectorAll('[data-focus]').forEach((button) => button.addEventListener('click', async () => { await send({ type: 'START_FOCUS', minutes: Number(button.dataset.focus) }); await render(); }));
$('#stop-focus').addEventListener('click', async () => { await send({ type: 'STOP_FOCUS' }); await render(); });
$('#save-page').addEventListener('click', async () => { try { if (!currentTab?.url?.startsWith('https://')) throw new Error('当前页面不能收藏'); await send({ type: 'SAVE_PAGE', page: { url: currentTab.url, title: currentTab.title || currentTab.url } }); notice('已加入稍后学习'); } catch (error) { notice(error.message, true); } });
async function savePreferences() { const next = { ...status.preferences, enabled: $('#enabled').checked, countAI: $('#count-ai').checked, goalMinutes: Math.max(10, Math.min(1440, Number($('#goal').value) || 120)), idleSeconds: Number($('#idle').value) }; await send({ type: 'SAVE_PREFERENCES', preferences: next }); status.preferences = next; notice('设置已保存，稍后同步到云端'); }
['#enabled', '#count-ai', '#goal', '#idle'].forEach((selector) => $(selector).addEventListener('change', savePreferences));
$('#import-lite').addEventListener('click', () => $('#lite-file').click());
$('#lite-file').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 5_000_000) throw new Error('备份文件过大');
    const payload = JSON.parse(await file.text());
    const result = await send({ type: 'IMPORT_LITE', payload });
    await send({ type: 'SYNC' });
    await render();
    notice(`已导入 ${result.imported} 条 Lite 网站记录`);
  } catch (error) { notice(error.message, true); }
  event.target.value = '';
});
function hostLines(selector) { return $(selector).value.split(/[,\s;|]+/).map((value) => value.trim()).filter(Boolean); }
function normalizeHost(value) { return String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/:?#]/)[0]; }
function renderSafeguardSites() {
  const list = $('#sg-site-list');
  list.replaceChildren();
  for (const site of safeguard?.customSites || []) {
    const row = document.createElement('div');
    row.className = 'sg-site-row';
    const text = document.createElement('span');
    text.textContent = `${site.d} · ${site.c}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '移除';
    remove.addEventListener('click', () => {
      safeguard.customSites = safeguard.customSites.filter((entry) => !(entry.d === site.d && entry.c === site.c));
      renderSafeguardSites();
    });
    row.append(text, remove);
    list.append(row);
  }
  if (!list.childElementCount) list.textContent = '尚未添加自定义域名。';
}
$('#sg-add-domain').addEventListener('click', () => {
  const category = $('#sg-domain-category').value;
  const domains = [...new Set(hostLines('#sg-domain-input').map(normalizeHost).filter((host) => host.includes('.') && host.length > 3))];
  const existing = new Set((safeguard.customSites || []).map((site) => site.d));
  for (const domain of domains) if (!existing.has(domain)) { safeguard.customSites.push({ d: domain, c: category }); existing.add(domain); }
  $('#sg-domain-input').value = '';
  renderSafeguardSites();
});
$('#tools-save').addEventListener('click', async () => {
  try {
    tools = await send({ type: 'TOOLS_SAVE_CONFIG', payload: {
      cleanTrackingLinks: $('#tool-clean-links').checked,
      znotesQuizHelper: $('#tool-znotes').checked,
      bestExamDownloads: $('#tool-bestexam').checked,
      discordImageShield: $('#tool-image-shield').checked,
      timezoneBadges: $('#tool-timezone').checked,
    } });
    notice('内置工具已保存；刷新对应网页后应用');
  } catch (error) { notice(error.message, true); }
});
$('#sg-save').addEventListener('click', async () => {
  try {
    safeguard = await send({ type: 'SAFEGUARD_SAVE_CONFIG', payload: {
      ...safeguard,
      enabled: $('#sg-enabled').checked,
      blockChinese: $('#sg-chinese').checked,
      excludeEducation: $('#sg-education-exempt').checked,
      translationGraceMinutes: Math.max(1, Math.min(10, Number($('#sg-grace').value) || 2)),
      studySessionMinutes: Math.max(5, Math.min(120, Number($('#sg-study').value) || 30)),
      activeCategories: { ...safeguard.activeCategories, Pornography: $('#sg-porn').checked, Videos: $('#sg-videos').checked, Novels: $('#sg-novels').checked, Gaming: $('#sg-gaming').checked, Social: $('#sg-social').checked },
      customSites: safeguard.customSites || [],
      customEducationHosts: hostLines('#sg-education'),
      customEntertainmentHosts: hostLines('#sg-entertainment'),
    } });
    notice('SafeGuard 设置已保存；刷新网页后应用');
  } catch (error) { notice(error.message, true); }
});
render().catch((error) => notice(error.message, true));
