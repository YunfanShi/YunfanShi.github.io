import { APP_VERSION } from './utils.ts';

export type UpdateCategory = '学习体验' | '阅读与内容' | '平台体验' | '稳定性';

export interface UpdateEntry {
  version: string;
  date: string;
  dateLabel: string;
  title: string;
  summary: string;
  categories: UpdateCategory[];
  highlights: string[];
  accent: 'blue' | 'violet' | 'amber' | 'mint';
  featured?: boolean;
}

export const UPDATE_CATEGORIES: UpdateCategory[] = ['学习体验', '阅读与内容', '平台体验', '稳定性'];

export const UPDATE_HISTORY: UpdateEntry[] = [
  {
    version: APP_VERSION,
    date: '2026-10-02',
    dateLabel: '2026 年 10 月 2 日',
    title: '让认真复习留下自己的星空',
    summary: 'CUE 宇宙冒险升级为有纵深的学习背景，每次认真复习点亮一颗星，三种状态都留下成果。',
    categories: ['学习体验'],
    accent: 'violet',
    featured: true,
    highlights: [
      '电脑端可开启旋臂星场背景，薄荷绿、暖金和玫瑰色对应三种复习状态。',
      '每条 CUE 的星星拥有固定位置；积累、学科和每周成果保留在星空收藏中。',
      '轻巧打标反馈、多种阶段庆祝和右下角答题卡，支持关闭动画。',
      '宇宙冒险默认关闭，手机继续使用简洁的学习界面。',
    ],
  },
  {
    version: '3.16.0',
    date: '2026-09-21',
    dateLabel: '2026 年 9 月 21 日',
    title: '学习闭环，完整发生在一个空间里',
    summary: '本次更新把计划、学习、复习证据与 Cue 串成连续体验，也让 JackYun 在桌面与浏览器里更像一套完整产品。',
    categories: ['学习体验', '平台体验'],
    accent: 'blue',
    highlights: [
      '日程支持合并同学科任务，并保留每项任务的实际完成结果。',
      '学习任务可直接进入 Cue 练习；完成记录会保存资料范围、证据与复习状态。',
      '新增睡眠优化器，按起床时间、入睡耗时和睡眠周期生成可执行建议。',
      '上线全新的 Products 页面与 PWA 安装入口，统一桌面端产品体验。',
    ],
  },
  {
    version: '3.15.0',
    date: '2026-09-14',
    dateLabel: '2026 年 9 月 14 日',
    title: '阅读器与内容商店升级',
    summary: '从书城、兑换到阅读进度，长篇阅读体验完成了一次端到端升级。',
    categories: ['阅读与内容', '稳定性'],
    accent: 'violet',
    highlights: [
      '新增小说书城、兑换码权益与个人书架，内容获取路径更清晰。',
      '支持章节目录、滚动与翻页阅读模式，并在本地和云端保存阅读位置。',
      '书签与阅读位置分开管理：书签由用户明确保存，阅读位置自动续读。',
      '内容与封面更新可同步到已有书架，不覆盖用户自己的阅读记录。',
    ],
  },
  {
    version: '3.14.2',
    date: '2026-08-31',
    dateLabel: '2026 年 8 月 31 日',
    title: '更干净的新用户起点',
    summary: '移除个人化示例数据与固定身份，让每位用户从真正属于自己的工作区开始。',
    categories: ['平台体验', '稳定性'],
    accent: 'mint',
    highlights: [
      '新账号不再自动创建示例目标和示例倒计时。',
      '助手、仪表盘与倒计时中的固定个人称呼改为当前用户身份。',
      '旧工作台继续继承统一主题与界面偏好。',
    ],
  },
  {
    version: '3.12.3',
    date: '2026-08-14',
    dateLabel: '2026 年 8 月 14 日',
    title: '通知与支持体验重整',
    summary: '让反馈、回复和诊断记录更可靠，减少重复信息与不明确的处理状态。',
    categories: ['平台体验', '稳定性'],
    accent: 'amber',
    highlights: [
      '修复重复的 Bug 回复消息，已读内容不会反复出现。',
      '支持删除单条通知，已处理反馈不能重复回复。',
      'Bug 报告附带脱敏诊断日志，并显示邮件投递失败原因。',
    ],
  },
  {
    version: '3.12.1',
    date: '2026-08-14',
    dateLabel: '2026 年 8 月 14 日',
    title: '时间管理与运营后台升级',
    summary: '专注工具开始支持跨设备延续，运营能力也迁移到独立、清晰的管理界面。',
    categories: ['平台体验'],
    accent: 'blue',
    highlights: [
      '番茄钟支持云端同步，换设备后继续当前专注节奏。',
      '新增独立 Admin 控制台与通知中心。',
      '改进账号入口、安全头像上传与 Apple OAuth 登录准备。',
    ],
  },
];
