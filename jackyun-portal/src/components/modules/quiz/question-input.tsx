'use client';

import { useRef, useEffect, useState } from 'react';
import { getAnalysisPrompt } from '@/lib/quiz/question-analyzer';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';

interface QuestionInputProps {
  inputText: string;
  setInputText: (text: string) => void;
  onAnalyze: (text: string) => void;
  onImport: (json: string) => void;
  isAnalyzing: boolean;
  error: string | null;
}

export default function QuestionInput({
  inputText,
  setInputText,
  onAnalyze,
  onImport,
  isAnalyzing,
  error,
}: QuestionInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [jsonText, setJsonText] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    if (!isAnalyzing) {
      textareaRef.current?.focus();
    }
  }, [isAnalyzing]);

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 400) + 'px';
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted && !inputText) {
      // Auto-analyze on paste if no existing text
      setTimeout(() => {
        if (pasted.trim().length > 10) {
          onAnalyze(pasted);
        }
      }, 300);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const text = textareaRef.current?.value?.trim();
      if (text) onAnalyze(text);
    }
  };

  const handleSubmit = () => {
    const text = inputText.trim();
    if (!text || isAnalyzing) return;
    onAnalyze(text);
  };

  return (
    <div className="animate-fade-in space-y-4">
      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-[#4285F4]/5 border border-[#4285F4]/10">
        <span className="material-icons-round text-[#4285F4] text-xl mt-0.5">auto_awesome</span>
          <div className="text-sm text-[var(--muted-foreground)]">
            <p className="font-medium text-[var(--foreground)] mb-1">粘贴题目</p>
            <p>粘贴一道或多道题目，AI 会自动识别题型、提取选项并给出正确答案。</p>
            <p className="mt-1">
              <strong>支持题型：</strong>单选、多选、判断、填空、数值计算、简答、论述、匹配与排序题
            </p>
          </div>
      </div>

      {/* Textarea */}
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            autoResize();
          }}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          placeholder={`Paste your questions here...\n\nExample:\n1. What is the capital of France?\nA) London\nB) Paris\nC) Berlin\nD) Madrid\n\n2. ...`}
          disabled={isAnalyzing}
          rows={8}
          className="min-h-48 resize-none rounded-2xl bg-[var(--card)] px-5 py-4 text-sm leading-relaxed"
        />
        {isAnalyzing && (
          <div className="absolute inset-0 rounded-2xl bg-[var(--card)]/80 backdrop-blur-sm flex items-center justify-center z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#4285F4] animate-bounce [animation-delay:-0.3s]" />
                <div className="w-2 h-2 rounded-full bg-[#4285F4] animate-bounce [animation-delay:-0.15s]" />
                <div className="w-2 h-2 rounded-full bg-[#4285F4] animate-bounce" />
              </div>
              <p className="text-sm text-[var(--muted-foreground)] font-medium">
                AI is analyzing your questions...
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSubmit}
          disabled={!inputText.trim() || isAnalyzing}
          className="px-6 shadow-md"
        >
          <span className="material-icons-round text-lg">psychology</span>
          Analyze Questions
        </Button>
        <span className="text-xs text-[var(--muted-foreground)]">
          or press <kbd className="px-1.5 py-0.5 rounded bg-[var(--background)] border border-[var(--card-border)] font-mono text-[10px]">⌘ + ↵</kbd>
        </span>
      </div>

      <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4">
        <p className="text-sm font-semibold">用其他 AI 整理题目</p>
        <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">复制提示词和上方题目交给 AI，再把生成的 JSON 粘贴或上传到这里。导入前会检查题型、选项和答案。</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" onClick={async () => {
            try { await navigator.clipboard.writeText(getAnalysisPrompt(inputText.trim() || '请在这里粘贴待分析的题目。')); setCopyStatus('提示词和题目已复制。'); }
            catch { setCopyStatus('复制失败，请检查浏览器剪贴板权限。'); }
          }}>复制 AI 提示词{inputText.trim() ? '及题目' : ''}</Button>
          <Button variant="outline" onClick={() => setImportOpen((open) => !open)}>{importOpen ? '收起 JSON 导入' : '导入 AI 生成的 JSON'}</Button>
        </div>
        {copyStatus && <p role="status" className="mt-2 text-xs text-[var(--muted-foreground)]">{copyStatus}</p>}
        {importOpen && <div className="mt-3 space-y-2">
          <textarea value={jsonText} onChange={(event) => setJsonText(event.target.value)} rows={7} placeholder={'粘贴 {"questions":[...]}'} className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-3 font-mono text-xs outline-none focus:border-[#4285F4]" />
          <div className="flex flex-wrap items-center gap-2"><label className="cursor-pointer rounded-xl border border-[var(--card-border)] px-3 py-2 text-sm">选择 JSON 文件<input type="file" accept=".json,application/json" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (file) setJsonText(await file.text()); event.target.value = ''; }} /></label><button type="button" disabled={!jsonText.trim()} onClick={() => onImport(jsonText)} className="rounded-xl bg-[#4285F4] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">检查并导入</button></div>
        </div>}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-[#EA4335]/10 border border-[#EA4335]/20 text-sm text-[#EA4335]">
          <span className="material-icons-round text-base mt-0.5">error_outline</span>
          <div>
            <p className="font-medium">Analysis failed</p>
            <p className="text-xs opacity-80 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Quick Tips */}
      {!isAnalyzing && !error && (
        <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-3">
          {[
            { icon: 'quiz', title: 'Multiple Choice', desc: 'Questions with A/B/C/D options' },
            { icon: 'edit_note', title: 'Fill in Blank', desc: 'Questions with missing words/phrases' },
            { icon: 'article', title: 'Essay Questions', desc: 'Open-ended answers graded by AI' },
            { icon: 'check_box', title: 'Multi-select & Matching', desc: 'Select every correct answer or pair' },
            { icon: 'format_list_numbered', title: 'Ordering', desc: 'Tap items in the correct sequence' },
          ].map((tip) => (
            <div key={tip.title} className="p-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-center">
              <span className="material-icons-round text-[#4285F4] text-xl mb-1">{tip.icon}</span>
              <p className="text-xs font-medium text-[var(--foreground)]">{tip.title}</p>
              <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5">{tip.desc}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
