'use client';
import { workspaceStorage } from '@/lib/sync/repository';

import { useMemo, useState } from 'react';
import { memoryCueCandidates, newMemoryCueOperations } from '@/lib/learning/memory-cue-import';
import type { CueCreateOperation, LearningCatalogSubject, StudyCue } from '@/lib/learning/schedule-control';

function readSource(key: string): unknown {
  try { return JSON.parse(workspaceStorage.getItem(key) ?? '[]'); }
  catch (error) { console.error('[Memory CUE import] Cannot read source', key, error); return []; }
}
export function MemoryCueImportDialog({ catalog, cues, onApply, onClose }: { catalog: LearningCatalogSubject[]; cues: StudyCue[]; onApply: (operations: CueCreateOperation[]) => unknown; onClose: () => void }) {
  const [definitions] = useState(() => readSource('jackyun_definition_cards_v1'));
  const [decks] = useState(() => readSource('jackyun_property_decks_v1'));
  const [subjectName, setSubjectName] = useState('');
  const [unit, setUnit] = useState('');
  const [kind, setKind] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const candidates = useMemo(() => memoryCueCandidates(definitions, decks, subjectName, unit), [definitions, decks, subjectName, unit]);
  const visible = candidates.filter((item) => kind === 'all' || item.id.startsWith(kind));
  const operations = newMemoryCueOperations(candidates.filter((item) => selected.includes(item.id)), cues);
  const subject = catalog.find((item) => item.name === subjectName);
  return <div className="fixed inset-0 z-[90] grid place-items-center bg-black/50 p-2 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="memory-import-title">
    <section className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3"><h2 id="memory-import-title" className="text-xl font-semibold">从记忆工具导入 CUE</h2><button type="button" onClick={onClose} className="min-h-11 shrink-0 px-3">关闭</button></div>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">复制定义或完整的对比性质到 CUE。两份内容独立编辑，原来的学习历史保留；新 CUE 从首次检索开始记录。未填写完整的对比行不会导入。</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3"><select aria-label="目标学科" value={subjectName} onChange={(event) => { setSubjectName(event.target.value); setUnit(''); }} className="min-h-11 min-w-0 rounded-xl border bg-[var(--background)] px-2 text-base"><option value="">选择目标学科</option>{catalog.map((item) => <option key={item.id}>{item.name}</option>)}</select><select aria-label="目标单元" value={unit} onChange={(event) => setUnit(event.target.value)} className="min-h-11 min-w-0 rounded-xl border bg-[var(--background)] px-2 text-base"><option value="">选择目标单元</option>{subject?.units.map((item) => <option key={item.name}>{item.name}</option>)}</select><select aria-label="导入来源" value={kind} onChange={(event) => setKind(event.target.value)} className="min-h-11 rounded-xl border bg-[var(--background)] px-2 text-base"><option value="all">全部来源</option><option value="definition:">DEFINITIONS</option><option value="comparison:">对比记忆</option></select></div>
      <div className="my-3 flex flex-wrap gap-2"><button type="button" onClick={() => setSelected([...new Set([...selected, ...visible.map((item) => item.id)])])} className="min-h-11 rounded-xl border px-3">选择当前范围</button><button type="button" onClick={() => setSelected([])} className="min-h-11 px-3">清空选择</button></div>
      {!visible.length && <p className="py-5 text-sm">没有可导入的内容。请先在对应记忆工具保存定义或完整对比表。</p>}
      <div className="space-y-3">{visible.map((item) => <label key={item.id} className="flex gap-3 rounded-xl border border-[var(--card-border)] p-3"><input type="checkbox" checked={selected.includes(item.id)} onChange={(event) => setSelected((ids) => event.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id))} className="mt-1 h-5 w-5 shrink-0" /><span className="min-w-0 break-words"><span className="block text-xs text-[var(--muted-foreground)]">{item.source}</span><strong className="mt-1 block">{item.operation.prompt}</strong><span className="mt-2 block whitespace-pre-wrap text-sm">{item.operation.answer}</span></span></label>)}</div>
      <p role="status" className="mt-3 text-sm">已选 {selected.length} 条 · 可新建 {operations.length} 条（相同内容自动跳过）{notice && ` · ${notice}`}</p>
      <button type="button" disabled={!subjectName || !unit || !operations.length} onClick={() => { onApply(operations); setSelected([]); setNotice(`已导入 ${operations.length} 条，可在学习中选择这些 CUE。`); }} className="mt-3 min-h-11 rounded-xl bg-[var(--brand)] px-4 text-white disabled:opacity-40">确认导入到 CUE</button>
    </section>
  </div>;
}
