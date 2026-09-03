'use client';

import { useEffect, useState } from 'react';
import { callAiApi } from '@/lib/ai-config';
import { deleteLocalSite, listLocalSites, saveLocalSite } from '@/lib/personal-site-storage';
import { validatePersonalSite, type PersonalSiteBlock, type PersonalSiteDefinition } from '@/lib/personal-site';

function Block({ block, now }: { block: PersonalSiteBlock; now: number }) {
  if (block.type === 'heading') return <h2 className="text-3xl font-bold">{block.text}</h2>;
  if (block.type === 'text') return <p className="leading-7 opacity-80">{block.text}</p>;
  if (block.type === 'countdown') { const days = Math.max(0, Math.ceil((new Date(block.date).getTime() - now) / 86400000)); return <article className="rounded-2xl bg-white/15 p-5"><p className="text-sm opacity-70">{block.title}</p><p className="mt-2 text-4xl font-bold">{days} 天</p></article>; }
  if (block.type === 'tasks') return <article className="rounded-2xl bg-white/15 p-5"><h3 className="font-semibold">{block.title}</h3><ul className="mt-3 space-y-2">{block.items.map((item) => <li key={item}>□ {item}</li>)}</ul></article>;
  if (block.type === 'progress') return <article className="rounded-2xl bg-white/15 p-5"><div className="flex justify-between"><span>{block.title}</span><strong>{block.value}%</strong></div><div className="mt-3 h-2 rounded-full bg-black/15"><div className="h-full rounded-full bg-current" style={{ width: `${block.value}%` }} /></div></article>;
  return <article className="rounded-2xl bg-white/15 p-5"><h3 className="font-semibold">{block.title}</h3><div className="mt-3 flex flex-wrap gap-2">{block.items.map((item) => <a key={item.url} href={item.url} target="_blank" rel="noreferrer" className="rounded-lg bg-white/20 px-3 py-2 text-sm">{item.label}</a>)}</div></article>;
}

const palette = { light: 'bg-[#f8fafc] text-[#172033]', dark: 'bg-[#111827] text-white', blue: 'bg-gradient-to-br from-[#155eef] to-[#53b1fd] text-white', purple: 'bg-gradient-to-br from-[#6941c6] to-[#c11574] text-white' };

export default function PersonalSiteStudio() {
  const [prompt, setPrompt] = useState(''); const [sites, setSites] = useState<PersonalSiteDefinition[]>([]); const [site, setSite] = useState<PersonalSiteDefinition | null>(null); const [status, setStatus] = useState(''); const [loading, setLoading] = useState(false);
  const now = site ? new Date(site.updatedAt).getTime() : 0;
  useEffect(() => { void listLocalSites().then((items) => { setSites(items); setSite(items[0] ?? null); }).catch(() => setStatus('无法读取本地网站。')); }, []);
  const generate = async () => {
    if (!prompt.trim() || loading) return; setLoading(true); setStatus('AI 正在生成受控页面结构…');
    try {
      const current = site ? JSON.stringify({ name: site.name, theme: site.theme, blocks: site.blocks }) : '无';
      const response = await callAiApi([{ role: 'system', content: '你是页面配置生成器。仅输出 NDJSON，每行一个完整 JSON，不要 Markdown。第一行：{"kind":"meta","name":"名称","theme":"light|dark|blue|purple"}。后续每行：{"kind":"block","block":{...}}。block 只允许 heading{text}, text{text}, countdown{title,date:YYYY-MM-DD}, tasks{title,items:string[]}, progress{title,value:0-100}, links{title,items:[{label,url:https://...}]}。最多12个 block，禁止 HTML、CSS、JavaScript、iframe。' }, { role: 'user', content: `用户需求：${prompt.slice(0, 2000)}\n当前页面：${current.slice(0, 8000)}` }], { maxTokens: 3000, stream: true, feature: 'personal_site' });
      if (!response.ok) { const error = await response.json(); throw new Error(error?.error?.message || '生成失败'); }
      if (!response.body) throw new Error('模型没有返回内容');
      const reader = response.body.getReader(); const decoder = new TextDecoder();
      let eventBuffer = ''; let contentBuffer = ''; let name = site?.name ?? '我的网站'; let theme: PersonalSiteDefinition['theme'] = site?.theme ?? 'light'; const blocks: unknown[] = [];
      const consumeContent = async (chunk: string, final = false) => {
        contentBuffer += chunk; const lines = contentBuffer.split('\n'); if (!final) contentBuffer = lines.pop() ?? ''; else contentBuffer = '';
        for (const rawLine of lines) {
          const line = rawLine.trim(); if (!line || line.startsWith('```')) continue;
          try {
            const event = JSON.parse(line) as { kind?: string; name?: string; theme?: PersonalSiteDefinition['theme']; block?: unknown };
            if (event.kind === 'meta') { if (event.name) name = event.name; if (event.theme) theme = event.theme; }
            if (event.kind === 'block' && event.block && blocks.length < 12) blocks.push(event.block);
            const preview = validatePersonalSite({ id: site?.id, name, theme, blocks }); setSite(preview); setStatus(`实时生成中：已完成 ${preview.blocks.length} 个组件…`);
          } catch { /* Wait for the next complete NDJSON line. */ }
        }
      };
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        eventBuffer += decoder.decode(value, { stream: true }); const eventLines = eventBuffer.split('\n'); eventBuffer = eventLines.pop() ?? '';
        for (const line of eventLines) { if (!line.startsWith('data:')) continue; const payload = line.slice(5).trim(); if (!payload || payload === '[DONE]') continue; try { const data = JSON.parse(payload); await consumeContent(data.choices?.[0]?.delta?.content ?? ''); } catch {} }
      }
      await consumeContent('\n', true);
      const next = validatePersonalSite({ id: site?.id, name, theme, blocks }); await saveLocalSite(next); setSite(next); setSites((all) => [next, ...all.filter((item) => item.id !== next.id)]); localStorage.setItem('jackyun_personal_site_active', next.id); setStatus('生成完成，已永久保存在当前浏览器。');
    } catch (error) { setStatus(error instanceof Error ? error.message : '生成失败'); } finally { setLoading(false); }
  };
  const createBlank = () => { const next = validatePersonalSite({ name: '新网站', theme: 'light', blocks: [] }); setSite(next); setPrompt(''); };
  const saveCloud = async () => { if (!site) return; const response = await fetch('/api/personal-sites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(site) }); setStatus(response.ok ? '已同步到云端。' : '云端同步失败，本地副本仍然安全。'); };
  const remove = async () => { if (!site) return; await deleteLocalSite(site.id); const remaining = sites.filter((item) => item.id !== site.id); setSites(remaining); setSite(remaining[0] ?? null); setStatus('已删除本地网站。'); };
  return <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]"><aside className="space-y-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-bold text-[#7f56d9]">BETA</p><h1 className="text-xl font-semibold">AI 网站工作室</h1></div><button onClick={createBlank} className="rounded-lg border px-3 py-2 text-xs">新建</button></div><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={7} placeholder="告诉 AI 你想要什么，例如：制作一个深色考试倒计时主页，加入三项今日任务…" className="w-full rounded-xl border border-[var(--card-border)] bg-transparent p-3 text-sm leading-6" /><button disabled={loading || !prompt.trim()} onClick={generate} className="w-full rounded-xl bg-[#7f56d9] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{loading ? '生成中…' : site ? '让 AI 微调网站' : '生成网站'}</button>{status && <p role="status" className="text-xs leading-5 text-[var(--muted-foreground)]">{status}</p>}<div className="flex gap-2"><button disabled={!site} onClick={saveCloud} className="flex-1 rounded-lg border px-3 py-2 text-xs">云端备份</button><button disabled={!site} onClick={remove} className="rounded-lg border px-3 py-2 text-xs text-[#d92d20]">删除</button></div><div className="border-t border-[var(--card-border)] pt-4"><p className="text-xs font-semibold">本地网站</p><div className="mt-2 space-y-1">{sites.map((item) => <button key={item.id} onClick={() => setSite(item)} className={`w-full truncate rounded-lg px-3 py-2 text-left text-sm ${site?.id === item.id ? 'bg-[#f4ebff] text-[#6941c6]' : 'hover:bg-black/5'}`}>{item.name}</button>)}</div></div></aside><section className={`min-h-[70vh] overflow-hidden rounded-2xl border border-[var(--card-border)] p-6 shadow-sm ${site ? palette[site.theme] : 'grid place-items-center bg-[var(--card)] text-[var(--muted-foreground)]'}`}>{site ? <div className="mx-auto max-w-4xl space-y-5">{site.blocks.map((block) => <Block key={block.id} block={block} now={now} />)}</div> : <p>描述你想要的网站，生成结果会实时显示在这里。</p>}</section></div>;
}
