'use client';

import { useEffect, useState } from 'react';
import { callAiApi } from '@/lib/ai-config';
import { deleteLocalSite, listLocalSites, saveLocalSite } from '@/lib/personal-site-storage';
import { validatePersonalSite, type PersonalSiteBlock, type PersonalSiteDefinition } from '@/lib/personal-site';

const QUICK_PROMPTS = [
  { label: '⏳ 考试倒计时', prompt: '制作一个考试倒计时主页，包含备考任务、当前进度和常用学习链接。' },
  { label: '✅ 今日任务板', prompt: '制作一个今日学习任务板，包含标题、任务清单、进度和鼓励文字。' },
  { label: '📚 资源导航', prompt: '制作一个简洁的学习资源导航页，按用途列出常用链接。' },
  { label: '📈 进度看板', prompt: '制作一个学习进度看板，显示多个科目的目标、进度和下一步任务。' },
];

const palette = {
  light: 'bg-[#f8fafc] text-[#172033]',
  dark: 'bg-[#111827] text-white',
  blue: 'bg-gradient-to-br from-[#155eef] to-[#53b1fd] text-white',
  purple: 'bg-gradient-to-br from-[#6941c6] to-[#c11574] text-white',
};

function TaskBlock({ siteId, block }: { siteId: string; block: Extract<PersonalSiteBlock, { type: 'tasks' }> }) {
  const storageKey = `jackyun-site-tasks:${siteId}:${block.id}`;
  const [completed, setCompleted] = useState<boolean[]>([]);
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '[]') as unknown;
      queueMicrotask(() => setCompleted(Array.isArray(stored) ? stored.map(Boolean).slice(0, block.items.length) : []));
    } catch { queueMicrotask(() => setCompleted([])); }
  }, [block.items.length, storageKey]);
  const toggle = (index: number) => {
    const next = block.items.map((_, itemIndex) => itemIndex === index ? !completed[itemIndex] : Boolean(completed[itemIndex]));
    setCompleted(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
  };
  return <article className="rounded-2xl bg-white/15 p-5"><h3 className="font-semibold">{block.title}</h3><ul className="mt-3 space-y-2">{block.items.map((item, index) => <li key={`${item}-${index}`}><label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-white/10"><input type="checkbox" checked={Boolean(completed[index])} onChange={() => toggle(index)} className="mt-1" /><span className={completed[index] ? 'line-through opacity-55' : ''}>{item}</span></label></li>)}</ul></article>;
}

function Block({ siteId, block, now, onProgress }: { siteId: string; block: PersonalSiteBlock; now: number; onProgress: (value: number) => void }) {
  if (block.type === 'heading') return <h2 className="text-3xl font-bold">{block.text}</h2>;
  if (block.type === 'text') return <p className="leading-7 opacity-80">{block.text}</p>;
  if (block.type === 'countdown') { const days = Math.max(0, Math.ceil((new Date(block.date).getTime() - now) / 86400000)); return <article className="rounded-2xl bg-white/15 p-5"><p className="text-sm opacity-70">{block.title}</p><p className="mt-2 text-4xl font-bold">{days} 天</p></article>; }
  if (block.type === 'tasks') return <TaskBlock siteId={siteId} block={block} />;
  if (block.type === 'progress') return <article className="rounded-2xl bg-white/15 p-5"><div className="flex justify-between"><span>{block.title}</span><strong>{block.value}%</strong></div><div className="mt-3 h-2 rounded-full bg-black/15"><div className="h-full rounded-full bg-current transition-[width]" style={{ width: `${block.value}%` }} /></div><div className="mt-3 flex gap-2"><button type="button" onClick={() => onProgress(block.value - 10)} className="rounded-lg bg-white/20 px-3 py-1 text-sm" aria-label={`${block.title} 减少进度`}>−10</button><button type="button" onClick={() => onProgress(block.value + 10)} className="rounded-lg bg-white/20 px-3 py-1 text-sm" aria-label={`${block.title} 增加进度`}>+10</button></div></article>;
  return <article className="rounded-2xl bg-white/15 p-5"><h3 className="font-semibold">{block.title}</h3><div className="mt-3 flex flex-wrap gap-2">{block.items.map((item) => <a key={item.url} href={item.url} target="_blank" rel="noreferrer" className="rounded-lg bg-white/20 px-3 py-2 text-sm transition hover:bg-white/30">{item.label}</a>)}</div></article>;
}

export default function PersonalSiteStudio() {
  const [prompt, setPrompt] = useState('');
  const [sites, setSites] = useState<PersonalSiteDefinition[]>([]);
  const [site, setSite] = useState<PersonalSiteDefinition | null>(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const now = site ? new Date(site.updatedAt).getTime() : 0;

  useEffect(() => { void listLocalSites().then((items) => { setSites(items); setSite(items[0] ?? null); }).catch(() => setStatus('无法读取本地网站。')); }, []);

  const persist = (next: PersonalSiteDefinition, message = '修改已保存到当前浏览器。') => {
    const updated = { ...next, updatedAt: new Date().toISOString() };
    setSite(updated);
    setSites((all) => [updated, ...all.filter((item) => item.id !== updated.id)]);
    void saveLocalSite(updated).then(() => setStatus(message)).catch(() => setStatus('本地保存失败，请重试。'));
  };

  const updateBlock = (index: number, updater: (block: PersonalSiteBlock) => PersonalSiteBlock) => {
    if (!site) return;
    persist({ ...site, blocks: site.blocks.map((block, blockIndex) => blockIndex === index ? updater(block) : block) });
  };

  const moveBlock = (index: number, offset: -1 | 1) => {
    if (!site) return;
    const target = index + offset;
    if (target < 0 || target >= site.blocks.length) return;
    const blocks = [...site.blocks];
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    persist({ ...site, blocks });
  };

  const generate = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setStatus('AI 正在生成受控页面结构…');
    try {
      const current = site ? JSON.stringify({ name: site.name, theme: site.theme, blocks: site.blocks }) : '无';
      // Keep one ID for the entire stream. The previous implementation created
      // a new site on every chunk and repeatedly remounted the whole preview.
      const siteId = site?.id ?? crypto.randomUUID();
      const response = await callAiApi([{ role: 'system', content: '你是页面配置生成器。仅输出 NDJSON，每行一个完整 JSON，不要 Markdown。第一行：{"kind":"meta","name":"名称","theme":"light|dark|blue|purple"}。后续每行：{"kind":"block","block":{...}}。block 只允许 heading{text}, text{text}, countdown{title,date:YYYY-MM-DD}, tasks{title,items:string[]}, progress{title,value:0-100}, links{title,items:[{label,url:https://...}]}。优先生成可以点击操作的 tasks、progress 和 links。最多12个 block，禁止 HTML、CSS、JavaScript、iframe。' }, { role: 'user', content: `用户需求：${prompt.slice(0, 2000)}\n当前页面：${current.slice(0, 8000)}` }], { maxTokens: 3000, stream: true, feature: 'personal_site' });
      if (!response.ok) { const error = await response.json(); throw new Error(error?.error?.message || '生成失败'); }
      if (!response.body) throw new Error('模型没有返回内容');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let eventBuffer = '';
      let contentBuffer = '';
      let name = site?.name ?? '我的网站';
      let theme: PersonalSiteDefinition['theme'] = site?.theme ?? 'light';
      const blocks: unknown[] = [];
      const consumeContent = (chunk: string, final = false) => {
        contentBuffer += chunk;
        const lines = contentBuffer.split('\n');
        if (!final) contentBuffer = lines.pop() ?? ''; else contentBuffer = '';
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line || line.startsWith('```')) continue;
          try {
            const event = JSON.parse(line) as { kind?: string; name?: string; theme?: PersonalSiteDefinition['theme']; block?: unknown };
            if (event.kind === 'meta') { if (event.name) name = event.name; if (event.theme) theme = event.theme; }
            if (event.kind === 'block' && event.block && blocks.length < 12) blocks.push(event.block);
            const preview = validatePersonalSite({ id: siteId, name, theme, blocks });
            setSite(preview);
            setStatus(`实时生成中：已完成 ${preview.blocks.length} 个组件…`);
          } catch { /* Wait for the next complete NDJSON line. */ }
        }
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        eventBuffer += decoder.decode(value, { stream: true });
        const eventLines = eventBuffer.split('\n');
        eventBuffer = eventLines.pop() ?? '';
        for (const line of eventLines) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try { const data = JSON.parse(payload); consumeContent(data.choices?.[0]?.delta?.content ?? ''); } catch {}
        }
      }
      consumeContent('\n', true);
      const next = validatePersonalSite({ id: siteId, name, theme, blocks });
      await saveLocalSite(next);
      setSite(next);
      setSites((all) => [next, ...all.filter((item) => item.id !== next.id)]);
      localStorage.setItem('jackyun_personal_site_active', next.id);
      setStatus('生成完成；任务、进度和链接组件现在可以直接交互。');
    } catch (error) { setStatus(error instanceof Error ? error.message : '生成失败'); } finally { setLoading(false); }
  };

  const createBlank = () => { const next = validatePersonalSite({ name: '新网站', theme: 'light', blocks: [] }); setSite(next); setPrompt(''); };
  const saveCloud = async () => { if (!site) return; const response = await fetch('/api/personal-sites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(site) }); setStatus(response.ok ? '已同步到云端。' : '云端同步失败，本地副本仍然安全。'); };
  const remove = async () => { if (!site) return; await deleteLocalSite(site.id); const remaining = sites.filter((item) => item.id !== site.id); setSites(remaining); setSite(remaining[0] ?? null); setStatus('已删除本地网站。'); };

  return <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]"><aside className="space-y-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-bold text-[#7f56d9]">BETA</p><h1 className="text-xl font-semibold">AI 网站工作室</h1></div><button onClick={createBlank} className="rounded-lg border px-3 py-2 text-xs">新建</button></div><div className="flex flex-wrap gap-2">{QUICK_PROMPTS.map((item) => <button type="button" key={item.label} onClick={() => setPrompt(item.prompt)} className="rounded-full border border-[var(--card-border)] px-2.5 py-1.5 text-xs hover:border-[#7f56d9] hover:text-[#7f56d9]">{item.label}</button>)}</div><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={7} placeholder="告诉 AI 你想要什么，例如：制作一个深色考试倒计时主页，加入三项今日任务…" className="w-full rounded-xl border border-[var(--card-border)] bg-transparent p-3 text-sm leading-6" /><button disabled={loading || !prompt.trim()} onClick={generate} className="w-full rounded-xl bg-[#7f56d9] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{loading ? '生成中…' : site ? '让 AI 微调网站' : '生成网站'}</button>{status && <p role="status" className="text-xs leading-5 text-[var(--muted-foreground)]">{status}</p>}{site && <div><p className="mb-2 text-xs font-semibold">主题</p><div className="grid grid-cols-4 gap-1">{(['light', 'dark', 'blue', 'purple'] as const).map((theme) => <button type="button" key={theme} onClick={() => persist({ ...site, theme })} className={`rounded-lg border px-1 py-2 text-[10px] ${site.theme === theme ? 'border-[#7f56d9] bg-[#7f56d9]/10 text-[#7f56d9]' : 'border-[var(--card-border)]'}`}>{theme}</button>)}</div></div>}<div className="flex gap-2"><button disabled={!site} onClick={saveCloud} className="flex-1 rounded-lg border px-3 py-2 text-xs">云端备份</button><button disabled={!site} onClick={remove} className="rounded-lg border px-3 py-2 text-xs text-[#d92d20]">删除</button></div><div className="border-t border-[var(--card-border)] pt-4"><p className="text-xs font-semibold">本地网站</p><div className="mt-2 space-y-1">{sites.map((item) => <button key={item.id} onClick={() => setSite(item)} className={`w-full truncate rounded-lg px-3 py-2 text-left text-sm ${site?.id === item.id ? 'bg-[#f4ebff] text-[#6941c6]' : 'hover:bg-black/5'}`}>{item.name}</button>)}</div></div></aside><section className={`min-h-[70vh] overflow-hidden rounded-2xl border border-[var(--card-border)] p-6 shadow-sm ${site ? palette[site.theme] : 'grid place-items-center bg-[var(--card)] text-[var(--muted-foreground)]'}`}>{site ? <div className="mx-auto max-w-4xl space-y-5">{site.blocks.map((block, index) => <div key={block.id} className="group relative rounded-2xl"><Block siteId={site.id} block={block} now={now} onProgress={(value) => updateBlock(index, (current) => current.type === 'progress' ? { ...current, value: Math.max(0, Math.min(100, value)) } : current)} /><div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"><button type="button" disabled={index === 0} onClick={() => moveBlock(index, -1)} className="rounded bg-black/55 px-2 py-1 text-xs text-white disabled:opacity-30" aria-label="上移组件">↑</button><button type="button" disabled={index === site.blocks.length - 1} onClick={() => moveBlock(index, 1)} className="rounded bg-black/55 px-2 py-1 text-xs text-white disabled:opacity-30" aria-label="下移组件">↓</button><button type="button" onClick={() => persist({ ...site, blocks: site.blocks.filter((_, blockIndex) => blockIndex !== index) })} className="rounded bg-[#b42318] px-2 py-1 text-xs text-white" aria-label="删除组件">×</button></div></div>)}</div> : <p>描述你想要的网站，生成结果会实时显示在这里。</p>}</section></div>;
}
