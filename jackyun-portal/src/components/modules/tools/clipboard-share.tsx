'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { siteConfirm } from '@/lib/site-dialog';
import { useToolDraft } from './tool-drafts';

export default function ClipboardShare() {
  const [text, setText] = useToolDraft('clipboard.text', '');
  const [status, setStatus] = useState('');
  const [failed, setFailed] = useState(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);

  function edit(value: string) {
    generation.current++;
    setText(value);
    setStatus('');
    setFailed(false);
  }
  async function copy() {
    const token = ++generation.current;
    try {
      await navigator.clipboard.writeText(text);
      if (token === generation.current) { setFailed(false); setStatus('已复制到剪贴板'); }
    } catch {
      if (token === generation.current) { setFailed(true); setStatus('复制失败，请检查浏览器权限或手动复制'); }
    }
  }
  async function paste() {
    const token = ++generation.current;
    try {
      const value = await navigator.clipboard.readText();
      if (token !== generation.current) return;
      setText(value); setFailed(false); setStatus('已从剪贴板粘贴');
    } catch {
      if (token === generation.current) { setFailed(true); setStatus('粘贴失败，原文本已保留，请手动粘贴'); }
    }
  }
  async function clear() {
    const token = ++generation.current;
    if (await siteConfirm('清空当前文本？此操作无法撤销。', { title: '清空剪贴板文本', confirmLabel: '清空文本' })) {
      if (token === generation.current) edit('');
    }
  }

  return <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label htmlFor="tool-clipboard-text" className="text-sm font-medium">文本内容</label>
        <span className="text-xs text-[var(--muted-foreground)]">{text.length} 字符</span>
      </div>
      <Textarea id="tool-clipboard-text" value={text} onChange={event => edit(event.target.value)} placeholder="在此输入或粘贴文本..." rows={10} />
    </div>
    {status && <p role={failed ? 'alert' : 'status'} className={failed ? 'jy-notice-error' : 'text-sm text-[var(--ui-success)]'}>{status}</p>}
    <div className="flex flex-wrap gap-2">
      <Button onClick={copy} disabled={!text}>复制</Button>
      <Button onClick={paste} variant="outline">粘贴</Button>
      <Button onClick={clear} disabled={!text} variant="ghost">清空</Button>
    </div>
  </div>;
}
