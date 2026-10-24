'use client';

import { siteConfirm } from '@/lib/site-dialog';
import { useCallback, useEffect, useState, type ClipboardEvent } from 'react';
import type { DidaAccountView, DidaProject } from '@/lib/integrations/dida365';
import { parseSeiueHelperBundle, type SeiueAccountView } from '@/lib/integrations/seiue';

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({})) as { error?: string; accounts?: DidaAccountView[]; projects?: DidaProject[] };
  if (!response.ok) throw new Error(data.error || '请求失败。');
  return data;
}

export default function AccountConnectionsPanel() {
  const [accounts, setAccounts] = useState<DidaAccountView[]>([]);
  const [displayName, setDisplayName] = useState('我的滴答清单');
  const [token, setToken] = useState('');
  const [projects, setProjects] = useState<DidaProject[]>([]);
  const [projectId, setProjectId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [seiueAccounts, setSeiueAccounts] = useState<SeiueAccountView[]>([]);
  const [seiueToken, setSeiueToken] = useState('');
  const [seiueReflectionId, setSeiueReflectionId] = useState('');
  const [seiueSchoolId, setSeiueSchoolId] = useState('');
  const [seiueSite, setSeiueSite] = useState('https://chalk-c3.seiue.com/');
  const [seiueName, setSeiueName] = useState('我的 SEIUE');
  const load = useCallback(async () => {
    const data = await readJson(await fetch('/api/integrations/dida365/accounts', { cache: 'no-store' }));
    setAccounts(data.accounts ?? []);
  }, []);
  useEffect(() => { queueMicrotask(() => load().catch((error) => setMessage(error instanceof Error ? error.message : '读取关联账户失败。'))); }, [load]);
  const loadSeiue = useCallback(async () => {
    const data = await readJson(await fetch('/api/integrations/seiue/accounts', { cache: 'no-store' })) as { accounts?: SeiueAccountView[] };
    setSeiueAccounts(data.accounts ?? []);
  }, []);
  useEffect(() => { queueMicrotask(() => loadSeiue().catch(() => {})); }, [loadSeiue]);

  const connectSeiue = async () => {
    setBusy(true); setMessage('');
    try {
      await readJson(await fetch('/api/integrations/seiue/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'connect', token: seiueToken, reflectionId: seiueReflectionId, schoolId: seiueSchoolId, schoolSite: seiueSite, role: 'student', displayName: seiueName }) }));
      setSeiueToken(''); await loadSeiue(); setMessage('SEIUE 已关联。Token 最长保存 24 小时。');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'SEIUE 关联失败。'); }
    finally { setBusy(false); }
  };
  const renewSeiue = async (account: SeiueAccountView) => {
    if (seiueToken.trim().length < 16) { setMessage('请先粘贴新的 SEIUE Token。'); return; }
    setBusy(true); setMessage('');
    try {
      await readJson(await fetch('/api/integrations/seiue/accounts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: account.id, token: seiueToken }) }));
      setSeiueToken(''); await loadSeiue(); setMessage('SEIUE Token 已验证并更新，有效期最多 24 小时。');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'SEIUE Token 更新失败。'); }
    finally { setBusy(false); }
  };
  const disconnectSeiue = async (account: SeiueAccountView) => {
    if (!(await siteConfirm(`解除“${account.displayName}”的 SEIUE 关联吗？JackYun 将删除加密授权信息。`))) return;
    setBusy(true); setMessage('');
    try { await readJson(await fetch(`/api/integrations/seiue/accounts/${account.id}`, { method: 'DELETE' })); await loadSeiue(); setMessage('SEIUE 关联已解除，授权密文已删除。'); }
    catch (error) { setMessage(error instanceof Error ? error.message : '解除关联失败。'); }
    finally { setBusy(false); }
  };
  const pasteSeiueHelperBundle = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
    const bundle = parseSeiueHelperBundle(event.clipboardData.getData('text/plain'));
    if (!bundle) { setMessage('连接包格式无效或已截断。请从 SEIUE 助手重新复制；不要粘贴密码、Cookie 或整份请求标头。'); return; }
    setSeiueToken(bundle.token);
    setSeiueReflectionId(bundle.reflectionId);
    setSeiueSchoolId(bundle.schoolId);
    setSeiueSite(bundle.schoolSite);
    setMessage('已读取连接包并填入本页表单。连接包不会保存在浏览器存储；请验证并关联，之后清除剪贴板。');
  };

  const probe = async () => {
    setBusy(true); setMessage('');
    try {
      const data = await readJson(await fetch('/api/integrations/dida365/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'probe', token }) }));
      const next = data.projects ?? [];
      setProjects(next); setProjectId(next[0]?.id ?? '');
      setMessage(next.length ? '连接成功，请选择 Schedule 任务要加入的默认清单。' : '连接成功，但这个账户没有可用清单。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '检查连接失败。'); }
    finally { setBusy(false); }
  };
  const connect = async () => {
    setBusy(true); setMessage('');
    try {
      await readJson(await fetch('/api/integrations/dida365/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'connect', token, projectId, displayName }) }));
      setToken(''); setProjects([]); setProjectId(''); setDisplayName('我的滴答清单');
      await load(); setMessage('滴答清单账户已关联。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '关联失败。'); }
    finally { setBusy(false); }
  };
  const disconnect = async (account: DidaAccountView) => {
    if (!(await siteConfirm(`解除“${account.displayName}”的关联吗？已添加到滴答清单的任务不会被删除。`))) return;
    setBusy(true); setMessage('');
    try { await readJson(await fetch(`/api/integrations/dida365/accounts/${account.id}`, { method: 'DELETE' })); await load(); setMessage('账户关联已解除。'); }
    catch (error) { setMessage(error instanceof Error ? error.message : '解除关联失败。'); }
    finally { setBusy(false); }
  };

  return <div className="space-y-5">
    <section className="space-y-4 rounded-2xl border border-[var(--card-border)] p-4" aria-label="SEIUE 账户关联">
      <div className="flex items-start gap-3"><span aria-hidden="true" className="material-icons-round mt-0.5 text-[var(--brand)]">school</span><div><h3 className="font-semibold">关联 SEIUE 学生账户</h3><p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">读取课程、作业/资料待办、选课截止和校历。只读同步，不会代提交或修改 SEIUE 数据。</p></div></div>
      <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">安全说明：你粘贴的 Token 会发送到 JackYun 服务端，并使用 AES-256-GCM 加密保存，最长 24 小时；到期、SEIUE 返回 401 或解除关联时会删除。未配置加密密钥时服务端拒绝关联。不要粘贴学校密码或 Cookie。</p>
      <details className="rounded-xl border border-[var(--card-border)] p-3 text-sm">
        <summary className="min-h-9 cursor-pointer font-medium">详细教程：自动获取连接信息或手动复制</summary>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-xs leading-5 text-[var(--muted-foreground)]">
          <li><strong>先登录学校网站。</strong>用电脑上的 Chrome 或 Edge 打开学校平时使用的 SEIUE 网址，只在学校官方登录页正常登录，并进入“学生”身份下的个人课表。确认地址栏是学校的 HTTPS SEIUE 网站。</li>
          <li><strong>安装自动检测助手。</strong>先安装 Tampermonkey 或 Violentmonkey，然后<a className="font-semibold text-[var(--brand)] underline" href="/userscripts/seiue-connector.user.js" target="_blank" rel="noopener noreferrer">打开 JackYun SEIUE 连接助手脚本</a>并在脚本管理器中确认安装。脚本只在 <code>chalk-*.seiue.com</code> 学校前端运行；安装前可检查源码和权限说明。</li>
          <li><strong>打开 SEIUE 个人课表。</strong>助手会自动观察本页第一次发往官方 API 的个人课程 <code>GET</code> 请求，最多 60 秒；通常无需开发者工具，也无需手动触发刷新。检测成功后，点页面右下角“SEIUE 连接助手”，再点“复制连接包”。若没有检测到，可点“重新检测一次”后切换周或刷新课表。</li>
          <li><strong>粘贴连接包。</strong>回到本页，把连接包粘贴到下方“从助手粘贴连接信息”框；页面会拦截粘贴事件并只填入需要的字段，不会把整段 JSON 显示在页面上。随即清除剪贴板内容，再点击“验证并关联”。</li>
          <li><strong>连接包的安全边界。</strong>其中包含短期 Bearer Token。脚本只在本页内存暂存一次；只有你点击复制时才会写入系统剪贴板。请立即粘贴到 JackYun 并清除剪贴板。脚本自身不发网络请求、不持久化连接信息，刷新或关闭 SEIUE 页面后临时数据消失。粘贴并点击验证后，Token 会通过 HTTPS 发送到 JackYun 服务端，并以 AES-256-GCM 加密保存，最长 24 小时。</li>
          <li><strong>手动方式仍可用。</strong>不想安装脚本时，可用下列开发者工具步骤从一个成功的个人课表 GET 请求复制 Authorization、Reflection ID 和 School ID。</li>
          <li><strong>打开网络请求面板。</strong>按 <kbd>F12</kbd>（部分笔记本要按 <kbd>Fn + F12</kbd>），或按 <kbd>Ctrl + Shift + I</kbd>；选择 <strong>Network（网络）</strong>，再选 Fetch/XHR（获取/XHR）。点击清除记录按钮，避免误看之前的请求。</li>
          <li><strong>重新加载课表。</strong>保持 Network 面板打开，回到 SEIUE 页面刷新，再在过滤框输入 <code>api.seiue.com</code>。找到一个状态码为 <code>200</code> 的 <code>GET</code> 请求，路径类似 <code>/chalk/calendar/personals/…/events</code>，点开该行。</li>
          <li><strong>只取三个值。</strong>在请求详情的 <strong>Headers（标头）→ Request Headers（请求标头）</strong> 中，找到 <code>Authorization</code>、<code>X-Reflection-Id</code>、<code>X-School-Id</code>。Token 输入框只粘贴 <code>Authorization</code> 里 <code>Bearer </code> 后面的值，不要连同 <code>Bearer </code> 一起粘贴。Reflection ID 和 School ID 分别粘贴到同名输入框；如果请求头里没有 Reflection ID，可从该 events 请求路径中 <code>personals/</code> 与 <code>/events</code> 之间读取。</li>
          <li><strong>填写并验证。</strong>学校网址填浏览器地址栏中的 SEIUE 学校网站地址（不要填 <code>api.seiue.com</code>）；账户备注可自定义。学生角色由 JackYun 固定为 student。点击“验证并关联 SEIUE”；成功后 Token 输入框会清空，再到 SCHEDULE 切换周查看同步内容。</li>
          <li><strong>过期后手动续期。</strong>Token 最长保存 24 小时，没有受支持的自动续期。回到仍可正常使用的 SEIUE 页面，重新刷新课表并从新的 200 请求复制最新 Token；粘贴到学生 Token 输入框，点击已关联账户旁的“粘贴新 Token 并续期”。若学校、学生身份或 School ID 已变化，先解除关联再按本教程重新关联。</li>
        </ol>
        <div className="mt-3 rounded-lg bg-black/[.04] p-3 text-xs leading-5 dark:bg-white/[.05]"><strong>安全核对：</strong>JackYun 不会要求学校密码、Cookie 或 refresh token。不要导出 HAR、不要“复制为 cURL”、不要复制全部请求标头，也不要把 Token、连接包或请求详情截图发给任何人（包括 JackYun 支持聊天）。手动方式完成后清除 Network 记录并关闭开发者工具。自动助手只观察一次个人课程 GET 请求，不读取响应正文，也不发起新的 SEIUE 请求。</div>
        <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]"><strong>常见问题：</strong>列表为空时先确认 Network 面板在刷新前已打开，并查看 Fetch/XHR；没有 200 events 请求时回到学生身份并重新打开个人课表。验证提示 Token 失效/401 时重新复制最新 Token；403 通常要检查三个值是否来自同一个请求、当前是否选中学生身份。自动登录/续期保持关闭：目前未发现官方 refresh token，而自动登录需把学校密码交给服务器。</p>
      </details>
      {seiueAccounts.map(account => <div key={account.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-black/[.035] p-3 dark:bg-white/[.05]"><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{account.displayName}</strong><p className="mt-1 text-xs text-[var(--muted-foreground)]">学生账户 · Token 到期 {account.tokenExpiresAt ? new Date(account.tokenExpiresAt).toLocaleString('zh-CN') : '待续期'} · {account.schoolSite}</p><span className="text-xs">{account.status === 'active' ? '已连接' : '需要重新验证'}</span></div><button type="button" disabled={busy || seiueToken.trim().length < 16} onClick={() => void renewSeiue(account)} className="min-h-10 rounded-full border border-[var(--card-border)] px-3 text-xs disabled:opacity-40">粘贴新 Token 并续期</button><button type="button" disabled={busy} onClick={() => void disconnectSeiue(account)} className="min-h-10 rounded-full border border-[var(--card-border)] px-3 text-xs text-rose-600 disabled:opacity-40">解除关联</button></div>)}
      <label className="block text-sm font-medium">从助手粘贴连接信息<textarea value="" onChange={event => { event.currentTarget.value = ''; }} onPaste={pasteSeiueHelperBundle} rows={2} autoComplete="off" spellCheck={false} placeholder="在此处粘贴脚本复制的一次性连接包；粘贴内容不会显示" className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-xs" /><span className="mt-1 block text-xs font-normal text-[var(--muted-foreground)]">也可继续手动填写下方字段。此框只接受助手格式，并会拦截粘贴文本。</span></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">账户备注<input value={seiueName} maxLength={80} onChange={event => setSeiueName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5" /></label><label className="text-sm font-medium">SEIUE 学校前端网址<input type="url" value={seiueSite} onChange={event => setSeiueSite(event.target.value)} placeholder="https://school.seiue.com/" className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5" /></label><label className="text-sm font-medium">Reflection ID<input value={seiueReflectionId} onChange={event => setSeiueReflectionId(event.target.value)} autoComplete="off" className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5" /></label><label className="text-sm font-medium">School ID<input value={seiueSchoolId} onChange={event => setSeiueSchoolId(event.target.value)} autoComplete="off" className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5" /></label><label className="text-sm font-medium sm:col-span-2">学生 Token<input type="password" value={seiueToken} onChange={event => setSeiueToken(event.target.value)} autoComplete="new-password" placeholder="仅粘贴短期 Bearer Token；不要提供密码或 Cookie" className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5" /></label></div>
      <p className="text-xs leading-5 text-[var(--muted-foreground)]">学校网址仅接受 HTTPS 的 `*.seiue.com`。Token 由 JackYun 服务端固定请求 `api.seiue.com` 的只读接口。请从 SEIUE 官方界面获取 Token；JackYun 不会收集学校密码、Cookie 或 refresh token。</p>
      <button type="button" disabled={busy || seiueToken.trim().length < 16 || !seiueReflectionId || !seiueSchoolId} onClick={() => void connectSeiue()} className="min-h-11 rounded-full bg-[var(--brand)] px-4 text-sm font-semibold text-white disabled:opacity-40">{busy ? '验证中…' : '验证并关联 SEIUE'}</button>
    </section>
    {accounts.length > 0 && <div className="space-y-3">{accounts.map((account) => <div key={account.id} className="flex flex-col gap-3 rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-4 sm:flex-row sm:items-center"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#1a73e8] dark:bg-blue-950/40"><span className="material-icons-round">checklist</span></span><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{account.displayName}</strong><p className="mt-1 text-xs text-[var(--muted-foreground)]">滴答清单 · 默认清单：{account.projectName}</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">已关联</span><button type="button" disabled={busy} onClick={() => disconnect(account)} className="rounded-full border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold text-rose-600 disabled:opacity-50">解除关联</button></div>)}</div>}
    <div className="rounded-2xl border border-[var(--card-border)] p-4">
      <div className="flex items-start gap-3"><span className="material-icons-round mt-0.5 text-[#1a73e8]">add_link</span><div><h3 className="font-semibold">关联新的滴答清单账户</h3><p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">支持关联多个账户。第一版使用个人 API Token；Token 仅加密保存在服务端。</p></div></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">账户备注名<input value={displayName} maxLength={80} onChange={(event) => setDisplayName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 outline-none focus:border-[var(--brand)]" /></label><label className="text-sm font-medium">API Token<input type="password" value={token} autoComplete="off" onChange={(event) => { setToken(event.target.value); setProjects([]); setProjectId(''); }} placeholder="粘贴滴答清单个人 Token" className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 outline-none focus:border-[var(--brand)]" /></label></div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">在滴答清单网页版的“设置 → 账户 → API Token”中生成。请勿分享给他人。</p>
      {projects.length > 0 && <label className="mt-4 block text-sm font-medium">Schedule 默认添加到<select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5">{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>}
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy || token.trim().length < 8} onClick={probe} className="rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-semibold disabled:opacity-40">{busy ? '检查中…' : '检查连接'}</button>{projects.length > 0 && <button type="button" disabled={busy || !projectId} onClick={connect} className="rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:text-[#202124]">确认关联</button>}</div>
    </div>
    {message && <p role="status" className="rounded-xl bg-black/5 px-4 py-3 text-sm dark:bg-white/10">{message}</p>}
  </div>;
}
