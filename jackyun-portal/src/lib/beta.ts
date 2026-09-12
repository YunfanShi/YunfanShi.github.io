export const BETA_AGREEMENT_VERSION = '2026-09-03';
export const COMPANION_BETA_VERSION = '1.7.8';

export const BETA_FEATURES = [
  {
    id: 'browser-ai',
    name: '本地网页 AI',
    version: 'Portal 3.16.0',
    status: '测试中',
    description: '不需要 API Key，把站内 AI 请求交给你已登录的 ChatGPT、Claude、Gemini、DeepSeek、通义千问或 Perplexity。',
    testPoints: ['在设置中选择“本地网页 AI”', '完成一次手动复制、粘贴和导入', '检查结构化回复能否继续原任务'],
    knownIssue: '网页 AI 的回复格式可能不稳定；手动中转始终需要用户确认。',
  },
  {
    id: 'companion-ai',
    name: 'Companion 自动打开与填写',
    version: `Companion ${COMPANION_BETA_VERSION}`,
    status: '新 BETA',
    description: '自动识别账号模型、切换模型，打开所选 AI 对话并发送 Prompt，等待完整回复后回传 Portal。',
    testPoints: ['安装最新 BETA ZIP 并重新加载扩展', '扩展和 Portal 登录同一 BETA 账号', '确认打开、填写、等待、回传五个阶段都有状态'],
    knownIssue: '第三方 AI 网页改版或未登录时可能无法定位输入框；此时可直接使用页面里的手动复制模式。',
  },
  {
    id: 'site-studio',
    name: 'AI 网站工作室',
    version: 'Portal 3.16.0',
    status: '测试中',
    description: '用自然语言生成个人小站，在本地编辑组件，并按需备份到云端。',
    testPoints: ['生成一个包含标题、任务和进度的网站', '调整主题与组件顺序', '刷新页面并检查本地数据是否保留'],
    knownIssue: '生成次数受当前套餐限制；复杂自由布局仍在继续完善。',
  },
] as const;

export type BetaEnrollmentStatus = 'invited' | 'accepted' | 'declined' | 'revoked';

export interface BetaEnrollment {
  user_id: string;
  status: BetaEnrollmentStatus;
  invited_at: string;
  responded_at: string | null;
  agreement_version: string | null;
}

export function isBetaActive(enrollment: Pick<BetaEnrollment, 'status'> | null | undefined): boolean {
  return enrollment?.status === 'accepted';
}

export function releaseChannel(enrollment: Pick<BetaEnrollment, 'status'> | null | undefined): 'BETA' | 'STABLE' {
  return isBetaActive(enrollment) ? 'BETA' : 'STABLE';
}
