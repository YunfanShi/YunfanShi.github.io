'use client';

import Link from 'next/link';
import { useRef, useState, useTransition } from 'react';
import { setAiModelEnabled, testAiCatalogModel, type AiModelTestResult } from '@/actions/ai-admin';
import { AI_MODEL_CAPABILITY_LABELS, type AiModelCapability } from '@/lib/ai-model-capabilities';

export interface AiModelTestItem {
  id: number;
  displayName: string;
  modelId: string;
  providerName: string;
  description: string;
  capabilities: AiModelCapability[];
  enabled: boolean;
  sortOrder: number;
  consecutiveFailures: number;
  lastFailureDetail: string | null;
  totalErrorCount: number;
  lastErrorAt: string | null;
  testRunCount: number;
  testAttemptCount: number;
  lastTestAt: string | null;
  lastTestAttemptCount: number | null;
  lastTestAvailable: boolean | null;
  lastTestLog: AiModelTestResult['attempts'];
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-[#f9fafb] px-3 py-2 dark:bg-white/5"><p className="text-[10px] uppercase tracking-wide text-[#98a2b3]">{label}</p><p className="mt-0.5 text-sm font-semibold">{value}</p></div>;
}

export default function AiModelTestPanel({ initialModels }: { initialModels: AiModelTestItem[] }) {
  const [models, setModels] = useState(initialModels);
  const [results, setResults] = useState<Record<number, AiModelTestResult>>({});
  const [runningModelIds, setRunningModelIds] = useState<number[]>([]);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [pending, startTransition] = useTransition();
  const runTokenRef = useRef(0);
  const enabledModels = models.filter((model) => model.enabled);
  const testedResults = Object.values(results);

  async function runOne(modelId: number) {
    setRunningModelIds((ids) => [...ids, modelId]);
    const result = await testAiCatalogModel(modelId);
    setResults((current) => ({ ...current, [modelId]: result }));
    setModels((items) => items.map((item) => item.id === modelId ? { ...item, testRunCount: item.testRunCount + 1, testAttemptCount: item.testAttemptCount + result.attemptCount, lastTestAt: result.testedAt, lastTestAttemptCount: result.attemptCount, lastTestAvailable: result.available, totalErrorCount: item.totalErrorCount + result.attempts.filter((attempt) => !attempt.available).length, lastErrorAt: result.available ? item.lastErrorAt : result.testedAt } : item));
    setRunningModelIds((ids) => ids.filter((id) => id !== modelId));
    return result;
  }

  async function runAll() {
    const token = ++runTokenRef.current;
    setBulkRunning(true);
    setCompleted(0);
    setResults({});
    let nextIndex = 0;
    const worker = async () => {
      while (runTokenRef.current === token) {
        const model = enabledModels[nextIndex++];
        if (!model) return;
        await runOne(model.id);
        setCompleted((value) => value + 1);
      }
    };
    await Promise.all([worker(), worker()]);
    setBulkRunning(false);
  }

  function stopAll() {
    runTokenRef.current += 1;
    setBulkRunning(false);
  }

  function toggleModel(model: AiModelTestItem) {
    startTransition(async () => {
      const enabled = !model.enabled;
      const result = await setAiModelEnabled(model.id, enabled);
      if (result.success) setModels((items) => items.map((item) => item.id === model.id ? { ...item, enabled, consecutiveFailures: enabled ? 0 : item.consecutiveFailures, lastFailureDetail: enabled ? null : item.lastFailureDetail } : item));
    });
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><Link href="/admin/ai" className="inline-flex items-center gap-1 text-sm font-semibold text-[#155eef]"><span className="material-icons-round text-lg">arrow_back</span>返回 AI 配置</Link><p className="text-xs text-[#667085]">最多同时测试 2 个模型；失败自动重试 2 次并保存每次记录</p></div>

    <section className="rounded-2xl border border-[#e4e7ec] bg-white p-5 dark:border-white/10 dark:bg-[#182230]">
      <div className="flex flex-wrap items-center gap-3"><div className="min-w-64 flex-1"><h2 className="font-semibold">全站可用模型健康测试</h2><p className="mt-1 text-sm leading-6 text-[#667085]">发送最多 64 Token 的固定流式探针，测量连接/响应头、首个回复、总耗时与生成速度。停用模型不会包含在批量测试中，但仍可单独测试。</p></div>{bulkRunning ? <button type="button" onClick={stopAll} className="h-11 rounded-xl bg-[#b42318] px-4 text-sm font-semibold text-white">测试完当前模型后停止</button> : <button type="button" onClick={() => void runAll()} disabled={!enabledModels.length || runningModelIds.length > 0} className="h-11 rounded-xl bg-[#155eef] px-4 text-sm font-semibold text-white disabled:opacity-50"><span className="material-icons-round mr-2 align-middle text-lg">play_arrow</span>双并发测试全部 {enabledModels.length} 个模型</button>}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="进度" value={bulkRunning ? `${completed} / ${enabledModels.length}` : testedResults.length ? `${testedResults.length} 个已测试` : '尚未开始'} /><Metric label="可用" value={String(testedResults.filter((item) => item.available).length)} /><Metric label="不可用" value={String(testedResults.filter((item) => !item.available).length)} /><Metric label="当前" value={runningModelIds.length ? runningModelIds.map((id) => models.find((model) => model.id === id)?.displayName ?? '测试中').join('、') : '空闲'} /></div>
    </section>

    <div className="grid gap-4 xl:grid-cols-2">{models.map((model) => {
      const result = results[model.id];
      const visibleAttempts = result?.attempts ?? model.lastTestLog;
      const running = runningModelIds.includes(model.id);
      const tone = running ? 'border-[#84adff]' : result?.available ? 'border-[#75e0a7]' : result ? 'border-[#fda29b]' : 'border-[#e4e7ec] dark:border-white/10';
      return <article key={model.id} className={`rounded-2xl border bg-white p-5 dark:bg-[#182230] ${tone}`}>
        <div className="flex items-start gap-3"><div className={`mt-1 h-3 w-3 shrink-0 rounded-full ${running ? 'animate-pulse bg-[#155eef]' : result?.available ? 'bg-[#17b26a]' : result ? 'bg-[#f04438]' : model.enabled ? 'bg-[#98a2b3]' : 'bg-[#d0d5dd]'}`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{model.displayName}</h3>{!model.enabled && <span className="rounded-full bg-[#f2f4f7] px-2 py-0.5 text-[10px] font-medium text-[#667085]">已停用</span>}{result && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${result.available ? 'bg-[#dcfae6] text-[#067647]' : 'bg-[#fee4e2] text-[#b42318]'}`}>{result.available ? '可用' : '不可用'}</span>}</div><p className="mt-1 truncate text-xs text-[#667085]">顺序 {model.sortOrder} · {model.providerName} · {model.modelId}</p></div></div>
        <div className="mt-3 max-h-20 overflow-y-auto whitespace-normal break-words rounded-xl bg-[#f9fafb] p-3 text-xs leading-5 text-[#475467] dark:bg-white/5 dark:text-[#cbd5e1]">{model.description || '没有模型介绍'}</div>
        <div className="mt-3 flex flex-wrap gap-1">{model.capabilities.map((capability) => <span key={capability} className="rounded-md bg-[#f4ebff] px-2 py-1 text-[10px] font-medium text-[#6941c6]">{AI_MODEL_CAPABILITY_LABELS[capability]}</span>)}</div>
        {result && <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric label="HTTP" value={result.httpStatus ? String(result.httpStatus) : '—'} /><Metric label="连接/响应头" value={result.connectionMs === null ? '—' : `${result.connectionMs} ms`} /><Metric label="首个回复" value={result.firstTokenMs === null ? '—' : `${result.firstTokenMs} ms`} /><Metric label="总耗时" value={`${result.totalMs} ms`} /><Metric label="连接尝试" value={`${result.attemptCount} / 3`} /><Metric label="输出 Token" value={String(result.outputTokens)} /><Metric label="生成速度" value={result.tokensPerSecond === null ? '—' : `${result.tokensPerSecond} tok/s`} /><Metric label="测试时间" value={new Date(result.testedAt).toLocaleTimeString('zh-CN', { hour12: false })} /></div>}
        {visibleAttempts.length > 0 && <details className="mt-3 rounded-xl border border-[#e4e7ec] p-3 text-xs dark:border-white/10"><summary className="cursor-pointer font-semibold">查看{result ? '本次' : '上次'} {visibleAttempts.length} 次尝试日志</summary><div className="mt-2 space-y-2">{visibleAttempts.map((attempt) => <p key={attempt.attempt} className="break-words text-[#667085]">第 {attempt.attempt} 次 · {attempt.available ? '成功' : '失败'} · HTTP {attempt.httpStatus ?? '—'} · 连接 {attempt.connectionMs ?? '—'} ms · 首字 {attempt.firstTokenMs ?? '—'} ms · 总计 {attempt.totalMs} ms · {attempt.outputTokens} Token · {attempt.tokensPerSecond ?? '—'} tok/s{attempt.error ? ` · ${attempt.error}` : ''}</p>)}</div></details>}
        {result?.responsePreview && <p className="mt-3 max-h-20 overflow-y-auto rounded-xl border border-[#abefc6] bg-[#ecfdf3] p-3 text-xs leading-5 text-[#067647]">回复：{result.responsePreview}</p>}
        {(result?.error || model.lastFailureDetail) && <div className="mt-3 max-h-28 overflow-y-auto break-words rounded-xl border border-[#fecdca] bg-[#fef3f2] p-3 text-xs leading-5 text-[#b42318]">{result?.error ?? `最近故障：${model.lastFailureDetail}`}</div>}
        <div className="mt-3 text-xs leading-5 text-[#667085]">历史测试 {model.testRunCount} 轮 / {model.testAttemptCount} 次尝试 · 累计错误 {model.totalErrorCount} 次{model.lastErrorAt ? ` · 最后错误 ${new Date(model.lastErrorAt).toLocaleString('zh-CN')}` : ''}{model.lastTestAt ? ` · 最后测试 ${new Date(model.lastTestAt).toLocaleString('zh-CN')}` : ''}</div>
        <div className="mt-4 flex flex-wrap items-center gap-2"><button type="button" disabled={runningModelIds.length >= 2 || running || pending || bulkRunning} onClick={() => void runOne(model.id)} className="rounded-xl border border-[#155eef] px-3 py-2 text-xs font-semibold text-[#155eef] disabled:opacity-50">{running ? '测试中…' : '单独测试'}</button><button type="button" disabled={pending || running} onClick={() => toggleModel(model)} className={`rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${model.enabled ? 'border-[#fda29b] text-[#b42318]' : 'border-[#75e0a7] text-[#067647]'}`}>{model.enabled ? '停用模型' : '重新上架'}</button>{model.consecutiveFailures > 0 && <span className="ml-auto text-xs text-[#b54708]">连续确认故障 {model.consecutiveFailures} 次</span>}</div>
      </article>;
    })}</div>
  </div>;
}
