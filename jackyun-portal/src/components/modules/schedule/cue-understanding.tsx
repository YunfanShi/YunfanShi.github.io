'use client';

import { useState } from 'react';
import MarkdownRenderer from '@/components/modules/markdown-renderer';
import { TRAINING_POLICY, type HintLevel } from '@/lib/learning/independent-training';
import { cueBottlenecks, DEEP_CUE_DIMENSIONS, deepCueLabels, hasDeepUnderstanding, type CueDeepUnderstanding, type CueTrainingEvidence } from '@/lib/learning/cue-understanding';
import type { StudyCue } from '@/lib/learning/schedule-control';

const input = 'mt-1 w-full min-w-0 rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm';
const button = 'min-h-10 rounded-full border border-[var(--card-border)] px-3 py-2 text-xs font-semibold disabled:opacity-40';
const hintLabels = ['概念或公式', '一个条件或关键关系', '局部步骤', '完整解析'];

export function CueDeepEditor({value,onChange}: {value?:CueDeepUnderstanding;onChange:(value:CueDeepUnderstanding)=>void}) {
  return <details className="mt-4 rounded-xl border border-[var(--card-border)] p-3"><summary className="cursor-pointer text-sm font-semibold">Deep Understanding · 只补实际理解漏洞</summary><p className="mt-2 text-xs text-[var(--muted-foreground)]">按需填写维度，不需要全部完成；普通 Cue 保持简洁。问题先触发回忆，参考解释在学习时另行揭示。</p><label className="mt-3 block text-sm">理解漏洞<textarea aria-label="理解漏洞" className={input} rows={2} maxLength={1000} value={value?.gap??''} onChange={e=>onChange({...value,gap:e.target.value})} /></label>{DEEP_CUE_DIMENSIONS.map(key=><fieldset key={key} className="mt-3 space-y-2"><legend className="text-sm font-semibold">{deepCueLabels[key]}</legend><label className="block text-xs">{deepCueLabels[key]} 问题<input aria-label={`${deepCueLabels[key]} 问题`} className={input} maxLength={500} value={value?.[key]?.question??''} onChange={e=>onChange({...value,[key]:{question:e.target.value,answer:value?.[key]?.answer??''}})} /></label><label className="block text-xs">{deepCueLabels[key]} 参考解释<textarea aria-label={`${deepCueLabels[key]} 参考解释`} className={input} rows={2} maxLength={3000} value={value?.[key]?.answer??''} onChange={e=>onChange({...value,[key]:{question:value?.[key]?.question??'',answer:e.target.value}})} /></label></fieldset>)}</details>;
}

export function CueUnderstandingStudy({cue,value,onChange,transferLabel}: {cue:StudyCue;transferLabel?:string;value?:CueTrainingEvidence;onChange:(value:CueTrainingEvidence)=>void}) {
  const [level,setLevel] = useState<HintLevel>(1);
  const [prompt,setPrompt] = useState('');
  const evidence=value??{};
  const update=(patch:Partial<CueTrainingEvidence>)=>onChange({...evidence,...patch});
  const deep=cue.deepUnderstanding;
  const attempt=evidence.attempt??'';
  return <details data-cue-understanding className="my-2 w-full min-w-0 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3"><summary className="cursor-pointer text-sm font-semibold">{hasDeepUnderstanding(deep)?'深度理解与独立训练':'独立训练与本次卡点'}{evidence.hints?.length?` · 已用 ${evidence.hints.length} 次提示`:''}</summary>
    <p className="mt-2 text-xs text-[var(--muted-foreground)]">先独立回答，再核对。回忆正确与陌生题迁移分开记录；迁移请到考试诊断关联另一道实际新题。</p>
    <p className="mt-2 text-xs" data-cue-transfer-status>迁移证据：{transferLabel??'尚未关联新题验证'}</p>
    {deep?.gap && <p className="mt-2 text-sm">本次理解目标：{deep.gap}</p>}
    {DEEP_CUE_DIMENSIONS.filter(key=>deep?.[key]).map(key=>{const row=deep![key]!;const shown=evidence.revealed?.includes(key);return <div key={key} className="mt-3 rounded-xl border border-[var(--card-border)] p-3"><h4 className="text-xs font-semibold">{deepCueLabels[key]}</h4><MarkdownRenderer content={row.question} /><label className="mt-2 block text-xs">{deepCueLabels[key]} 我的回答<textarea aria-label={`${deepCueLabels[key]} 我的回答`} className={input} rows={2} maxLength={5000} value={evidence.answers?.[key]??''} onChange={e=>update({answers:{...evidence.answers,[key]:e.target.value}})} /></label><button type="button" className={`${button} mt-2`} disabled={!shown&&!evidence.answers?.[key]?.trim()} onClick={()=>update({revealed:shown?(evidence.revealed??[]).filter(k=>k!==key):[...(evidence.revealed??[]),key]})}>{shown?'隐藏':'核对'}{deepCueLabels[key]}参考解释</button>{shown&&<div className="mt-2" data-deep-cue-answer={key}><MarkdownRenderer content={row.answer} /></div>}</div>;})}
    <label className="mt-3 block text-sm">本次主要卡点<select aria-label="本次主要卡点" className={input} value={evidence.bottleneck??''} onChange={e=>update({bottleneck:e.target.value?e.target.value as CueTrainingEvidence['bottleneck']:undefined})}><option value="">未记录</option>{Object.entries(cueBottlenecks).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label>
    <label className="mt-3 flex gap-2 text-sm"><input aria-label="本次使用独立训练规则" type="checkbox" checked={evidence.independentMode===true} onChange={e=>update({independentMode:e.target.checked,...(e.target.checked&&evidence.hints===undefined?{hints:[]}:{} )})} />本次使用独立训练规则</label>
    {evidence.independentMode && <div className="mt-3 space-y-2"><p className="text-xs">先独立尝试，卡住后再说明已知、所求与尝试。生成指令不会计为使用提示；实际查看后主动记录。这里不自动调用 AI。</p><label className="block text-xs">已知 所求 已有尝试<textarea aria-label="已知 所求 已有尝试" className={input} rows={3} maxLength={5000} value={attempt} onChange={e=>update({attempt:e.target.value})} /></label><label className="block text-xs">需要的提示层级<select aria-label="需要的提示层级" className={input} value={level} onChange={e=>{setLevel(Number(e.target.value) as HintLevel);setPrompt('');}}>{hintLabels.map((label,index)=><option key={label} value={index+1}>{label}</option>)}</select></label><button type="button" className={button} disabled={!attempt.trim()} onClick={()=>setPrompt(`${TRAINING_POLICY}\n当前 Cue：${cue.prompt}\n我的已知、所求与已有尝试：${attempt}\n我明确请求：${hintLabels[level-1]}。${level===4?'我明确要求完整解析，本次不计无提示独立完成。':'只给本级一个提示，然后停下来，不提供后续推导或答案。'}\n题面不足时先问我，不根据标题猜题。`)}>生成本级 AI 指令</button>{prompt&&<label className="block text-xs">复制给 AI 的训练指令<textarea aria-label="复制给 AI 的训练指令" className={input} readOnly rows={5} value={prompt} onFocus={e=>e.target.select()} /></label>}<button type="button" className={button} disabled={(evidence.hints?.length??0)>=100} onClick={()=>{update({hints:[...(evidence.hints??[]),{id:crypto.randomUUID(),level,at:new Date().toISOString()}]});setPrompt('');}}>记录实际已用提示并隐藏指令</button><p className="text-xs">{evidence.hints===undefined?'提示使用尚未记录':`实际使用 ${evidence.hints.length} 次；最高层级 ${Math.max(0,...evidence.hints.map(h=>h.level))}`}。保存本题评价时一并记录。</p></div>}
  </details>;
}
