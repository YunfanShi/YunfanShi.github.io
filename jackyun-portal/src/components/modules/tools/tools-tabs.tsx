'use client';

import { useState } from 'react';
import { ToolPanel } from './tool-panel';
import TextTools from './text-tools';
import { ToolDraftProvider } from './tool-drafts';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, getDialogContainer } from '@/components/ui/dialog';

const TABS = [
  { id: 'text', label: '文本工具', icon: 'text_snippet' },
  { id: 'time', label: '时间同步', icon: 'schedule' },
  { id: 'clipboard', label: '剪贴板', icon: 'content_paste' },
  { id: 'md2word', label: 'Markdown 转 Word', icon: 'description' },
  { id: 'study', label: '学习与日常', icon: 'school' },
] as const;

export default function ToolsTabs() {
  const [active, setActive] = useState('text');
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  return <ToolDraftProvider>
    <div className="mb-3 flex justify-end">
      <Dialog>
        <DialogTrigger asChild><Button variant="ghost" size="sm" onClick={event => setPortalContainer(getDialogContainer(event.currentTarget))}>使用说明</Button></DialogTrigger>
        <DialogContent portalContainer={portalContainer}>
          <DialogTitle>工具箱使用说明</DialogTitle>
          <DialogDescription>文本、文档和日常换算均可在本机使用。</DialogDescription>
          <div className="mt-4 space-y-3 text-sm leading-6">
            <p>切换工具会保留本次页面会话中的输入、结果和文件名。离开工具箱或刷新页面会结束本次会话，重要内容请及时复制或下载。</p>
            <p>Tab 键移动焦点；工具标签可用方向键选择，再按 Enter 或空格打开。按 Escape 可关闭说明。</p>
            <p>剪贴板读写需要浏览器授权。拒绝授权时，文本会保留，可手动选择和复制。</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    <Tabs value={active} onValueChange={setActive} activationMode="manual">
      <TabsList aria-label="工具分类">
        {TABS.map(tab => <TabsTrigger key={tab.id} value={tab.id}>
          <span className="material-icons-round text-base" aria-hidden="true">{tab.icon}</span>
          <span>{tab.label}</span>
        </TabsTrigger>)}
      </TabsList>
      {TABS.map(tab => <TabsContent key={tab.id} value={tab.id}>
        <h2 className="mb-5 flex items-center gap-2 font-semibold"><span className="material-icons-round text-xl text-[var(--brand)]" aria-hidden="true">{tab.icon}</span>{tab.label}</h2>
        {active === tab.id && (tab.id === 'text' ? <TextTools /> : <ToolPanel id={tab.id} />)}
      </TabsContent>)}
    </Tabs>
  </ToolDraftProvider>;
}
