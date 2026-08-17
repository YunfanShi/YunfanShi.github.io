export type ScriptCategory = 'study' | 'focus' | 'communication' | 'portal';

export interface UserscriptEntry {
  id: string;
  name: string;
  version: string;
  category: ScriptCategory;
  description: string;
  sites: string[];
  features: string[];
  file: string;
  caution?: string;
}

export const USERSCRIPTS: UserscriptEntry[] = [
  {
    id: 'znotes-quiz-helper',
    name: 'ZNotes 刷题助手',
    version: '2.3',
    category: 'study',
    description: '使用数字键 1–4 选择答案、Enter 进入下一题，并以轻量弹窗提示对错。',
    sites: ['znotes.org'],
    features: ['键盘作答', '对错提示', '不改动原页面布局'],
    file: '/userscripts/znotes-quiz-helper.user.js',
  },
  {
    id: 'bestexam-batch-downloader',
    name: 'BestExamHelp Batch Downloader',
    version: '1.1',
    category: 'study',
    description: '识别试卷列表并尝试把页面链接转换为 PDF，提供批量下载按钮。',
    sites: ['bestexamhelp.com'],
    features: ['批量下载', 'PHP → PDF 链接转换', '下载间隔保护'],
    file: '/userscripts/bestexam-batch-downloader.user.js',
    caution: '一次会发起多个下载，请先确认浏览器的多文件下载权限。',
  },
  {
    id: 'save-my-exams-console',
    name: 'Save My Exams 终极控制台',
    version: '30.0',
    category: 'study',
    description: '面向 Save My Exams 的调试与下载控制台，包含模块测试、动画预览和日志工具。',
    sites: ['savemyexams.com', 'savemyexams.co.uk'],
    features: ['调试控制台', '流式下载', '模块测试'],
    file: '/userscripts/save-my-exams-console.user.js',
  },
  {
    id: 'ultimate-focus',
    name: "Jack's Ultimate Focus",
    version: '24.9',
    category: 'focus',
    description: '在 YouTube 与指定学习网站记录专注时间，管理学习关键词并自动合并历史统计。',
    sites: ['youtube.com', 'koolearn.com'],
    features: ['专注统计', '关键词分类', '历史数据合并'],
    file: '/userscripts/jacks-ultimate-focus.user.js',
  },
  {
    id: 'timezone-panel',
    name: 'Timezone Panel · Bilibili & Discord',
    version: '5.1.0',
    category: 'communication',
    description: '在 Bilibili 私信与 Discord 消息旁显示 CST（UTC−6）时间，并提供浮动时区面板。',
    sites: ['message.bilibili.com', 'discord.com'],
    features: ['时区换算', '消息时间徽章', '浮动面板'],
    file: '/userscripts/timezone-panel.user.js',
  },
  {
    id: 'discord-image-shield',
    name: 'Discord 图片拦截器 · Image Shield',
    version: '2.0.0',
    category: 'communication',
    description: '在学校或工作场景隐藏 Discord 聊天图片，支持占位/模糊和单张解锁。',
    sites: ['discord.com', 'ptb.discord.com', 'canary.discord.com'],
    features: ['图片拦截', '单张解锁', '模糊模式'],
    file: '/userscripts/discord-image-shield.user.js',
  },
  {
    id: 'relax-interpreter',
    name: "Jack's Relax Interpreter (Lite)",
    version: '1.2',
    category: 'portal',
    description: '为旧版 Relax 页面中的 AI 指令标签添加中文解释，不增加额外控制台界面。',
    sites: ['yunfanshi.github.io/Relax.html'],
    features: ['指令解释', '即时监听', '轻量 UI'],
    file: '/userscripts/relax-interpreter.user.js',
  },
];
