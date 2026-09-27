'use client';

import Image from 'next/image';
import { useState } from 'react';
import MarkdownRenderer from '@/components/modules/markdown-renderer';
import { parseAiJson } from '@/lib/ai-json';
import { dateKey, type LearningCatalogSubject, type StudyCue } from '@/lib/learning/schedule-control';
import {
  applyQuestionOperations, copyCueToQuestion, parseQuestionImport, questionImportTemplate, questionMatchesFilter, removeQuestion,
  type QuestionBankState, type QuestionContent, type QuestionFilter, type QuestionOperation, type StudyQuestion,
} from '@/lib/learning/question-bank';

export const studyInputClass = 'w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-base';
export const studyButtonClass = 'rounded-xl border border-[var(--card-border)] px-4 py-2.5 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40';
export const questionTypeLabels = { single: '单选', multiple: '多选', boolean: '判断', written: '主观题' };
export function studyStatusMark(status?: string) { return status === 'stable' ? '√' : status === 'partial' ? '△' : status === 'unclear' ? '○' : '未练习'; }
const blank: QuestionContent = { subjectId: '', subjectName: '', unit: '', subsection: '', type: 'written', prompt: '', choices: [], correctChoices: [], answer: '', explanation: '', markingPoints: [], linkedCueIds: [] };

function QuestionEditor({ initial, catalog, cues, onSave, onCancel }: { initial: QuestionContent; catalog: LearningCatalogSubject[]; cues: StudyCue[]; onSave: (content: QuestionContent) => void; onCancel: () => void }) {
  const [content, setContent] = useState(initial);
  const [choicesText, setChoicesText] = useState(initial.choices.join('\n'));
  const [pointsText, setPointsText] = useState(initial.markingPoints.join('\n'));
  const [error, setError] = useState('');
  const subject = catalog.find((item) => item.id === content.subjectId);
  const field = (key: keyof QuestionContent, value: unknown) => setContent((current) => ({ ...current, [key]: value }));
  const choices = content.type === 'boolean' ? ['正确', '错误'] : choicesText.split('\n').filter((item) => item.trim());
  return <form className="space-y-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 sm:p-6" onSubmit={(event) => {
    event.preventDefault();
    try { onSave({ ...content, choices: content.type === 'written' ? [] : choices, markingPoints: pointsText.split('\n').filter((point) => point.trim()) }); }
    catch (error) { setError(error instanceof Error ? error.message : '保存失败。'); }
  }}>
    <h3 className="text-lg font-semibold">题目编辑 · 文本、公式与图片</h3>
    <p className="text-sm">短编号：{content.code || '保存后自动生成，例如 MA-001'} · 保存后固定，可直接写在本子上。</p>
    {content.sourceCueId && <p className="text-sm text-[var(--muted-foreground)]">从 CUE 复制：题干 → 题干，答案 → 参考答案，副标题 → 解析，评分点 → 评分点。复制后两份内容独立编辑，原 CUE 与学习历史保留。</p>}
    <div className="grid gap-4 sm:grid-cols-2">
      <label>科目<select aria-label="题目科目" required className={studyInputClass} value={content.subjectId} onChange={(event) => { const subject = catalog.find((item) => item.id === event.target.value); setContent((current) => ({ ...current, subjectId: subject?.id ?? '', subjectName: subject?.name ?? '', unit: '', subsection: '', linkedCueIds: [] })); }}><option value="">选择科目</option>{catalog.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>单元<input aria-label="题目单元" required className={studyInputClass} list="question-unit-options" value={content.unit} onChange={(event) => field('unit', event.target.value)} /><datalist id="question-unit-options">{subject?.units.map((unit) => <option key={unit.name} value={unit.name} />)}</datalist></label>
      <label>小节（可选）<input className={studyInputClass} value={content.subsection} onChange={(event) => field('subsection', event.target.value)} /></label>
      <label>题型<select className={studyInputClass} value={content.type} onChange={(event) => setContent((current) => ({ ...current, type: event.target.value as QuestionContent['type'], correctChoices: [] }))}>{Object.entries(questionTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    <section className="space-y-3 rounded-xl border border-[var(--card-border)] p-3"><h4 className="font-semibold">题目图片</h4><p className="text-xs text-[var(--muted-foreground)]">图片和题目一起同步、备份；支持 PNG / JPEG / WebP，每张最多 2 MB，每题 6 张。解析图片只在查看答案后显示。</p><label className={studyButtonClass}>添加图片<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" multiple onChange={async (event) => {
      const files = Array.from(event.target.files ?? []); event.target.value = '';
      try {
        if ((content.images?.length ?? 0) + files.length > 6) throw new Error('每题最多 6 张图片。');
        const images = await Promise.all(files.map(async (file) => {
          if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) throw new Error('图片格式不支持或超过 2 MB。');
          const url = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('图片读取失败。')); reader.readAsDataURL(file); });
          return { id: crypto.randomUUID(), url, alt: file.name, placement: 'prompt' as const };
        }));
        setContent((current) => ({ ...current, images: [...(current.images ?? []), ...images] })); setError('');
      } catch (error) { setError(error instanceof Error ? error.message : '图片读取失败。'); }
    }} /></label>{content.images?.map((image) => <div key={image.id} className="space-y-2"><Image unoptimized src={image.url} alt={image.alt} width={800} height={600} className="h-auto max-h-64 w-auto max-w-full rounded-xl object-contain" /><input aria-label="图片说明" className={studyInputClass} value={image.alt} onChange={(event) => field('images', content.images?.map((item) => item.id === image.id ? { ...item, alt: event.target.value } : item))} /><select aria-label="图片显示位置" className={studyInputClass} value={image.placement} onChange={(event) => field('images', content.images?.map((item) => item.id === image.id ? { ...item, placement: event.target.value } : item))}><option value="prompt">题干图片</option><option value="answer">答案 / 解析图片</option></select><button type="button" className={studyButtonClass} onClick={() => field('images', content.images?.filter((item) => item.id !== image.id))}>移除图片</button></div>)}</section>
    <label className="block">题干<textarea required aria-label="题干" rows={4} className={studyInputClass} value={content.prompt} onChange={(event) => field('prompt', event.target.value)} /></label>
    {['single', 'multiple'].includes(content.type) && <label className="block">选项（每行一个）<textarea rows={4} className={studyInputClass} value={choicesText} onChange={(event) => { setChoicesText(event.target.value); field('correctChoices', []); }} /></label>}
    {content.type !== 'written' && <fieldset className="space-y-2"><legend className="text-sm">正确选项（可以留空，学习时自评）</legend>{choices.map((choice, index) => <label key={index} className="flex items-center gap-3 rounded-xl border border-[var(--card-border)] p-3"><input type="checkbox" checked={content.correctChoices.includes(index)} onChange={(event) => field('correctChoices', content.type === 'multiple' ? event.target.checked ? [...content.correctChoices, index] : content.correctChoices.filter((item) => item !== index) : event.target.checked ? [index] : [])} /><span>{String.fromCharCode(65 + index)} · {choice}</span></label>)}</fieldset>}
    <div className="grid gap-4 sm:grid-cols-2">
      <label>参考答案<textarea rows={4} className={studyInputClass} value={content.answer} onChange={(event) => field('answer', event.target.value)} /></label>
      <label>解析<textarea rows={4} className={studyInputClass} value={content.explanation} onChange={(event) => field('explanation', event.target.value)} /></label>
    </div>
    <label className="block">评分点（每行一个）<textarea rows={3} className={studyInputClass} value={pointsText} onChange={(event) => setPointsText(event.target.value)} /></label>
    <div className="grid gap-4 sm:grid-cols-3">
      <label>题目来源<input required placeholder="教材 / 试卷 / 个人编写" className={studyInputClass} value={content.source ?? ''} onChange={(event) => field('source', event.target.value)} /></label>
      <label>原书题号（可选）<input className={studyInputClass} value={content.number ?? ''} onChange={(event) => field('number', event.target.value)} /></label>
      <label>满分（可选）<input type="number" min="0.01" step="any" className={studyInputClass} value={content.maxScore ?? ''} onChange={(event) => field('maxScore', event.target.value === '' ? undefined : Number(event.target.value))} /></label>
    </div>
    <details><summary className="cursor-pointer text-sm font-semibold">关联知识 CUE · 已选 {content.linkedCueIds.length} 条</summary><div className="mt-2 max-h-64 space-y-2 overflow-y-auto">{cues.filter((cue) => cue.subjectId === content.subjectId).map((cue) => <label key={cue.id} className="flex items-start gap-3 rounded-xl border border-[var(--card-border)] p-3"><input type="checkbox" className="mt-1" checked={content.linkedCueIds.includes(cue.id)} onChange={(event) => field('linkedCueIds', event.target.checked ? [...content.linkedCueIds, cue.id] : content.linkedCueIds.filter((id) => id !== cue.id))} /><span className="min-w-0 text-sm">{cue.unit} · {cue.prompt}</span></label>)}</div></details>
    <details><summary className="cursor-pointer text-sm font-semibold">预览题干与答案</summary><div className="mt-3"><MarkdownRenderer content={content.prompt} /><hr className="my-3" /><MarkdownRenderer content={content.answer || '没有参考答案，学习时自评。'} /></div></details>
    {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    <div className="flex flex-wrap gap-2"><button type="submit" className={`${studyButtonClass} bg-[var(--brand)] text-white`}>保存题目</button><button type="button" onClick={onCancel} className={studyButtonClass}>取消</button></div>
  </form>;
}

export default function QuestionBankManager({ bank, catalog, cues, onChange, onCatalog }: { bank: QuestionBankState; catalog: LearningCatalogSubject[]; cues: StudyCue[]; onChange: (next: QuestionBankState) => void; onCatalog: () => void }) {
  const [subjectId, setSubjectId] = useState('');
  const [unit, setUnit] = useState('');
  const [filter, setFilter] = useState<QuestionFilter>('all');
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<{ id?: string; content: QuestionContent } | null>(null);
  const [json, setJson] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [preview, setPreview] = useState<QuestionOperation[] | null>(null);
  const [notice, setNotice] = useState('');
  const [copyId, setCopyId] = useState('');
  const date = dateKey(new Date());
  const filtered = bank.questions.filter((item) => (!subjectId || item.subjectId === subjectId) && (!unit || item.unit === unit) && questionMatchesFilter(item, bank, filter, date) && `${item.code ?? ''} ${item.prompt} ${item.answer} ${item.source ?? ''} ${item.number ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  const selectedSubject = catalog.find((item) => item.id === subjectId);
  const validateCatalog = (operations: QuestionOperation[]) => {
    for (const operation of operations) {
      const content = operation.action === 'create' ? operation.question : { ...bank.questions.find((item) => item.id === operation.id)!, ...operation.changes };
      const subject = catalog.find((item) => item.id === content.subjectId && item.name === content.subjectName);
      if (!subject) throw new Error('科目 id / 名称必须与现有科目目录一致，请先在学习目录添加科目。');
      if (content.linkedCueIds.some((id) => !cues.some((cue) => cue.id === id && cue.subjectId === content.subjectId) && !(operation.action === 'update' && bank.questions.find((question) => question.id === operation.id)?.linkedCueIds.includes(id)))) throw new Error('关联 CUE 必须存在且属于同一科目。');
    }
  };
  const apply = (operations: QuestionOperation[]) => {
    validateCatalog(operations);
    onChange(applyQuestionOperations(bank, operations, new Date().toISOString(), () => crypto.randomUUID()));
    setNotice(`已保存 ${operations.length} 项题目变更。`);
  };
  const clipboard = async (text: string) => { try { await navigator.clipboard.writeText(text); setNotice('已复制。'); } catch { setJson(text); setImportOpen(true); setNotice('请在文本框中手动复制。'); } };
  const questionHistory = (question: StudyQuestion) => bank.attempts.filter((item) => item.questionId === question.id).toSorted((a, b) => b.reviewedAt.localeCompare(a.reviewedAt));
  return <section className="mt-5 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">题库管理</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">独立题目与作答历史，共用知识 CUE 的科目目录。</p></div><div className="flex flex-wrap gap-2"><button className={studyButtonClass} onClick={onCatalog}>学习目录</button><button className={studyButtonClass} onClick={() => setEditor({ content: { ...blank, subjectId, subjectName: selectedSubject?.name ?? '', unit } })}>新增题目</button><button className={studyButtonClass} onClick={() => { setImportOpen(!importOpen); setPreview(null); }}>批量导入 / 导出</button></div></div>
    {notice && <p role="status" className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">{notice}</p>}
    {!catalog.length && <p className="rounded-xl border border-dashed border-[var(--card-border)] p-4">请先通过“学习目录”添加科目，再创建题目。</p>}
    {editor && <QuestionEditor key={editor.id ?? editor.content.sourceCueId ?? 'new'} initial={editor.content} catalog={catalog} cues={cues} onCancel={() => setEditor(null)} onSave={(content) => { apply([editor.id ? { action: 'update', id: editor.id, changes: content } : { action: 'create', question: content }]); setEditor(null); }} />}
    <div className="grid gap-3 sm:grid-cols-4"><select aria-label="题库科目筛选" className={studyInputClass} value={subjectId} onChange={(event) => { setSubjectId(event.target.value); setUnit(''); }}><option value="">全部科目</option>{catalog.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select><select aria-label="题库单元筛选" className={studyInputClass} value={unit} onChange={(event) => setUnit(event.target.value)}><option value="">全部单元</option>{[...new Set(bank.questions.filter((item) => !subjectId || item.subjectId === subjectId).map((item) => item.unit))].map((value) => <option key={value}>{value}</option>)}</select><select aria-label="题库状态筛选" className={studyInputClass} value={filter} onChange={(event) => setFilter(event.target.value as QuestionFilter)}>{Object.entries({ all: '全部题目', unreviewed: '未练习 / 已修改', due: '到期', weak: '△ / ○', partial: '仅 △', unclear: '仅 ○', stable: '仅 √', 'repeated-weak': '近期反复失误' }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input aria-label="搜索题目" placeholder="搜索短编号、来源、原书题号…" className={studyInputClass} value={query} onChange={(event) => setQuery(event.target.value)} /></div>
    {importOpen && <div className="space-y-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4"><h3 className="font-semibold">JSON 导入 / 导出</h3><p className="text-sm text-[var(--muted-foreground)]">格式：version: 1，operations。create 使用 question；update 使用真实 id 与 changes，只修改提供的字段。正确选项使用零起始序号；留空表示自评。以下是可用科目与 CUE ID。</p><details><summary className="cursor-pointer text-sm">查看科目与 CUE ID</summary><pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify({ subjects: catalog.map(({ id, name, units }) => ({ id, name, units: units.map((unit) => unit.name) })), cues: cues.filter((cue) => !subjectId || cue.subjectId === subjectId).map(({ id, subjectId, prompt }) => ({ id, subjectId, prompt })) }, null, 2)}</pre></details><div className="flex flex-wrap gap-2"><button className={studyButtonClass} onClick={() => void clipboard(questionImportTemplate(subjectId, selectedSubject?.name ?? '', unit))}>复制导入示例</button><button className={studyButtonClass} onClick={() => void clipboard(JSON.stringify({ version: 1, operations: filtered.map((question) => ({ action: 'update', id: question.id, changes: { subjectId: question.subjectId, subjectName: question.subjectName, unit: question.unit, subsection: question.subsection, type: question.type, prompt: question.prompt, choices: question.choices, correctChoices: question.correctChoices, answer: question.answer, explanation: question.explanation, markingPoints: question.markingPoints, linkedCueIds: question.linkedCueIds, source: question.source, number: question.number, maxScore: question.maxScore, sourceCueId: question.sourceCueId, images: question.images } })) }, null, 2))}>复制当前题目（保留 ID）</button><button className={studyButtonClass} onClick={() => {
      const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, operations: filtered.map((question) => ({ action: 'create', question })) }, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'question-bank.json'; link.click(); URL.revokeObjectURL(url);
    }}>导出当前题目（新建导入）</button></div><textarea aria-label="题库 JSON" rows={8} className={`${studyInputClass} font-mono text-sm`} value={json} onChange={(event) => { setJson(event.target.value); setPreview(null); }} /><button className={studyButtonClass} onClick={() => { try { const operations = parseQuestionImport(parseAiJson(json), bank); validateCatalog(operations); setPreview(operations); setNotice('请检查预览后应用。'); } catch (error) { setNotice(error instanceof Error ? error.message : '读取失败。'); } }}>读取并预览</button>{preview && <div className="space-y-2"><p className="font-semibold">预览：新增 {preview.filter((item) => item.action === 'create').length} 题，修改 {preview.filter((item) => item.action === 'update').length} 题</p>{preview.map((operation, index) => <div key={index} className="rounded-xl bg-black/5 p-3 text-sm dark:bg-white/5">{operation.action === 'create' ? `新增 · ${operation.question.subjectName} / ${operation.question.unit} · ${operation.question.prompt}` : `修改 · ${operation.id} · ${Object.keys(operation.changes).join('、')}`}</div>)}<button className={`${studyButtonClass} bg-[var(--brand)] text-white`} onClick={() => { try { apply(preview); setPreview(null); } catch (error) { setNotice(error instanceof Error ? error.message : '保存失败。'); } }}>应用预览中的变更</button></div>}</div>}
    <div className="flex flex-col gap-3 rounded-2xl border border-[var(--card-border)] p-4"><label className="min-w-0 w-full">从知识 CUE 复制到题库<select aria-label="选择要复制的 CUE" className={studyInputClass} value={copyId} onChange={(event) => setCopyId(event.target.value)}><option value="">选择现有 CUE</option>{cues.filter((cue) => !subjectId || cue.subjectId === subjectId).map((cue) => <option key={cue.id} value={cue.id}>{cue.subjectName} / {cue.unit} · {cue.prompt.slice(0, 80)}</option>)}</select></label><button disabled={!copyId} className={studyButtonClass} onClick={() => { const cue = cues.find((item) => item.id === copyId); if (cue) setEditor({ content: copyCueToQuestion(cue) }); }}>预览复制</button></div>
    <p className="text-sm text-[var(--muted-foreground)]">显示 {filtered.length} / {bank.questions.length} 题</p>
    <div className="grid gap-4 lg:grid-cols-2">{filtered.map((question) => <article key={question.id} className="min-w-0 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-[var(--muted-foreground)]">{question.code} · {question.subjectName} / {question.unit} · {questionTypeLabels[question.type]} · v{question.version}</span><strong>{studyStatusMark(bank.reviews[question.id]?.status)}</strong></div><MarkdownRenderer content={question.prompt} /><QuestionImages question={question} placement="prompt" /><p className="mt-2 text-xs text-[var(--muted-foreground)]">{[question.source, question.number ? `题号 ${question.number}` : '', bank.reviews[question.id]?.nextReviewDate ? `下次 ${bank.reviews[question.id].nextReviewDate}` : '尚未练习'].filter(Boolean).join(' · ')}</p><div className="mt-3 flex flex-wrap gap-2"><button className={studyButtonClass} onClick={() => setEditor({ id: question.id, content: question })}>编辑</button><button className={studyButtonClass} onClick={() => { if (window.confirm('删除这道题目？已保存的作答历史会保留，学习队列会移除此题。')) { onChange(removeQuestion(bank, question.id)); setNotice('题目已删除，历史记录保留。'); } }}>删除</button></div><details className="mt-3"><summary className="cursor-pointer text-sm font-semibold">作答历史 · {questionHistory(question).length} 次</summary><div className="mt-2 space-y-3">{questionHistory(question).map((attempt) => <div key={attempt.id} className="rounded-xl bg-black/5 p-3 text-sm dark:bg-white/5"><p>{new Date(attempt.reviewedAt).toLocaleString('zh-CN')} · v{attempt.questionVersion} · {studyStatusMark(attempt.status)} · {attempt.correct === null ? '自评' : attempt.correct ? '答对' : '答错'}{attempt.score !== undefined ? ` · ${attempt.score}${attempt.snapshot.maxScore ? ` / ${attempt.snapshot.maxScore}` : ''} 分` : ''}</p><p className="mt-1 whitespace-pre-wrap">作答：{attempt.paper ? '纸上作答' : attempt.text || attempt.selectedChoices.map((index) => `${String.fromCharCode(65 + index)}. ${attempt.snapshot.choices[index]}`).join('；') || '未填写'}</p>{attempt.issue && <p>错因：{attempt.issue}</p>}<details><summary className="cursor-pointer">查看当时题目与答案</summary><MarkdownRenderer content={attempt.snapshot.prompt} /><QuestionImages question={attempt.snapshot} placement="prompt" /><QuestionImages question={attempt.snapshot} placement="answer" /><MarkdownRenderer content={attempt.snapshot.answer || attempt.snapshot.correctChoices.map((index) => attempt.snapshot.choices[index]).join('；') || '未提供答案'} /></details></div>)}</div></details></article>)}</div>
    {!filtered.length && <p className="rounded-2xl border border-dashed border-[var(--card-border)] p-8 text-center text-[var(--muted-foreground)]">当前筛选下没有题目。可以新增，或从现有 CUE 复制。</p>}
  </section>;
}

export function QuestionImages({ question, placement }: { question: QuestionContent; placement: 'prompt' | 'answer' }) {
  return <div className="space-y-3">{question.images?.filter((image) => image.placement === placement).map((image) => <figure key={image.id}><a href={image.url} target="_blank" rel="noreferrer" aria-label="打开原图"><Image unoptimized src={image.url} alt={image.alt || '题目图片'} width={1200} height={900} className="h-auto w-auto max-w-full rounded-xl object-contain" /></a>{image.alt && <figcaption className="mt-1 text-xs text-[var(--muted-foreground)]">{image.alt}</figcaption>}</figure>)}</div>;
}
