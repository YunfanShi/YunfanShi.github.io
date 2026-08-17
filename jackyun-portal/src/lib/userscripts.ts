export type ScriptCategory = 'study' | 'focus' | 'communication' | 'portal';

export interface UserscriptEntry {
  id: string;
  name: string;
  version: string;
  category: ScriptCategory;
  description: string;
  sites: string[];
  features: string[];
  file?: string;
  installUrl?: string;
  sourceUrl?: string;
  license?: string;
  external?: boolean;
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
  {
    id: 'youtube-alchemy',
    name: 'YouTube Alchemy',
    version: 'GitHub',
    category: 'study',
    description: '面向 YouTube 学习场景的社区增强脚本，提供字幕与 transcript 导出、播放速度、默认字幕语言、隐藏 Shorts 等大量选项。',
    sites: ['youtube.com'],
    features: ['Transcript 导出', '播放控制', '字幕语言', '隐藏干扰内容'],
    installUrl: 'https://raw.githubusercontent.com/TimMacy/YouTubeAlchemy/main/YouTubeAlchemy.js',
    sourceUrl: 'https://github.com/TimMacy/YouTubeAlchemy',
    license: 'AGPL-3.0',
    external: true,
    caution: '第三方项目会独立更新；安装前请在 GitHub 查看最新说明和权限。',
  },
  {
    id: 'immersive-translate',
    name: '沉浸式翻译 · Userscript',
    version: '官方发布版',
    category: 'study',
    description: '为网页、PDF、EPUB 和字幕提供双语对照翻译，适合阅读英文资料和进行语言学习。',
    sites: ['多网站', 'PDF', 'EPUB'],
    features: ['双语对照', 'PDF 翻译', '字幕翻译', '输入框翻译'],
    installUrl: 'https://download.immersivetranslate.com/immersive-translate.user.js',
    sourceUrl: 'https://github.com/immersive-translate/immersive-translate',
    license: '非开源发布版',
    external: true,
    caution: '翻译内容可能发送给你选择的翻译服务；该 GitHub 仓库用于发布版本，不包含当前源代码。',
  },
  {
    id: 'bilibili-subtitle-download',
    name: 'Bilibili International Subtitle Downloader',
    version: 'GitHub',
    category: 'study',
    description: '为 Bilibili International 视频提供字幕下载入口，适合保存课程字幕后做笔记或语言分析。',
    sites: ['bilibili.tv'],
    features: ['字幕下载', '课程笔记', 'Tampermonkey'],
    installUrl: 'https://raw.githubusercontent.com/AdvMaple/bilibili-subtitle-download-plugin/feature/download.user.js',
    sourceUrl: 'https://github.com/AdvMaple/bilibili-subtitle-download-plugin',
    license: '仓库未明确标注',
    external: true,
    caution: '这是较早的社区脚本，主要面向 Bilibili International；网页结构变化后可能失效。',
  },
];
