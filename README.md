# JackYun Personal Portal

> 个人全能管理系统 — 全栈功能集成，学习·生活·工具一站式平台
>
> Built with Next.js 15 + Supabase + Tailwind CSS 4 + TypeScript 5

---

## 项目架构

本仓库采用**新旧双轨过渡**架构：

| 目录 | 说明 |
|------|------|
| 根目录（`*.html`） | 旧版静态 HTML 页面（历史遗留，通过 Legacy Bridge 嵌入新系统） |
| `jackyun-portal/` | **新版** Next.js 15 App Router + Supabase 全栈应用（主系统） |

旧版 HTML 文件列表（根目录）：`AnswerSheet.html` `Control.html` `Countdown.html` `EM.html` `Goal.html` `IGCountdown.html` `igcse_timer.html` `index.html` `jack-warden-mock.html` `Jump.html` `JumpMusic.html` `MockPortal.html` `MusicPlayer.html` `MusicPlayerBase.html` `MusicPlayerMobile.html` `Poem.html` `Relax.html` `Studyplan.html` `Test.html` `Time.html` `UpdateHub.html` `Vocab.html` `VocabJ.html` `VocabM.html`

---

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| **框架** | [Next.js 15](https://nextjs.org/) | App Router 模式，Server Component 优先 |
| **后端/数据库** | [Supabase](https://supabase.com/) | PostgreSQL + Auth + Row Level Security |
| **样式** | [Tailwind CSS 4](https://tailwindcss.com/) | 使用 @tailwindcss/postcss 插件，CSS 变量主题系统 |
| **认证** | GitHub OAuth · Google OAuth · Email/Password | 多 Provider 账号关联，白名单访问控制 |
| **语言** | TypeScript 5.9 | 严格模式（`"strict": true`） |
| **图标** | Material Icons Round | Google Fonts CDN 引入 |
| **LaTeX** | KaTeX 0.17 | 数学公式渲染（AI 助手回复中支持） |
| **AI 集成** | @google/generative-ai | 统一 LLM Proxy 代理，支持 OpenAI / DeepSeek / Gemini 等 |
| **工具类** | clsx + tailwind-merge | `cn()` 合并 CSS 类名 |
| **部署** | Vercel (推荐) / 自托管 Node.js | `output: 'standalone'` 模式 |

### package.json 依赖

**运行时依赖**：
- `@google/generative-ai` — Google Gemini AI SDK
- `@supabase/ssr` — Supabase SSR 客户端
- `@supabase/supabase-js` — Supabase JS 客户端
- `clsx` + `tailwind-merge` — CSS 类名合并工具
- `katex` + `@types/katex` — LaTeX 渲染
- `next` 15.x + `react` 19.x + `react-dom` 19.x

**开发依赖**：
- `@tailwindcss/postcss` + `tailwindcss` 4.x
- `typescript` 5.9.3
- `eslint` 9.x + `eslint-config-next` 15.x
- `@types/node` + `@types/react` + `@types/react-dom`

### Next.js 配置

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  output: 'standalone',           // Docker/自托管部署
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },   // Google 头像
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' }, // GitHub 头像
    ],
  },
};
```

### TypeScript 配置

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2017",
    "strict": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

### Tailwind 配置

```typescript
// tailwind.config.ts — 品牌色 + 圆角扩展
theme: {
  extend: {
    colors: {
      brand: {
        blue: '#4285F4',
        red: '#EA4335',
        yellow: '#FBBC05',
        green: '#34A853',
      },
    },
    borderRadius: { card: '12px' },
  },
},
```

---

## 路由结构

### Auth 路由组 `(auth)` — 未登录页面

| 路由 | 文件 | 说明 |
|------|------|------|
| `/login` | `src/app/(auth)/login/page.tsx` | 登录页（Email + GitHub + Google OAuth） |
| `/auth/callback` | `src/app/(auth)/auth/callback/route.ts` | Supabase OAuth 回调处理 |
| `/reset-password` | `src/app/(auth)/reset-password/page.tsx` | 邮件重置密码 |
| `/update-password` | `src/app/(auth)/update-password/page.tsx` | 新密码设置（OAuth 用户首次设密码） |
| `/unauthorized` | `src/app/(auth)/unauthorized/page.tsx` | 未授权提示页 |

### Portal 路由组 `(portal)` — 登录后主界面

所有 Portal 页面共享 Sidebar + Topbar + LegacyBridge + KeyboardShortcuts + AiChatFab 布局。

| 路由 | 文件 | 类型 | 说明 |
|------|------|------|------|
| `/` | `src/app/page.tsx` | 重定向 | → `/dashboard` |
| `/dashboard` | `src/app/(portal)/dashboard/page.tsx` | Server Component | 导航中心 + 学习统计 |
| `/study` | `src/app/(portal)/study/page.tsx` | Legacy Frame | 学习计划（嵌入旧版 HTML） |
| `/vocab` | `src/app/(portal)/vocab/page.tsx` | Legacy Frame | 词汇宝库（嵌入旧版 HTML） |
| `/music` | `src/app/(portal)/music/page.tsx` | Legacy Frame | 音乐播放器（嵌入旧版 HTML） |
| `/poem` | `src/app/(portal)/poem/page.tsx` | Legacy Frame | 诗词天地（嵌入旧版 HTML） |
| `/countdown` | `src/app/(portal)/countdown/page.tsx` | Legacy Frame | 倒计时（嵌入旧版 HTML） |
| `/relax` | `src/app/(portal)/relax/page.tsx` | Legacy Frame | 放松一下（嵌入旧版 HTML） |
| `/answer-sheet` | `src/app/(portal)/answer-sheet/page.tsx` | Legacy Frame | 答题卡（嵌入旧版 HTML） |
| `/control` | `src/app/(portal)/control/page.tsx` | Legacy Frame | 控制中心（嵌入旧版 HTML） |
| `/goal` | `src/app/(portal)/goal/page.tsx` | Legacy Frame | 计划显示器（嵌入旧版 HTML） |
| `/igcountdown` | `src/app/(portal)/igcountdown/page.tsx` | Legacy Frame | 考试倒计时（嵌入旧版 HTML） |
| `/update-hub` | `src/app/(portal)/update-hub/page.tsx` | Legacy Frame | 更新日志（嵌入旧版 HTML） |
| `/mock-portal` | `src/app/(portal)/mock-portal/page.tsx` | Legacy Frame | Mock 刷题（嵌入旧版 HTML） |
| `/tools` | `src/app/(portal)/tools/page.tsx` | Server Component | 工具箱（文本处理/时间同步/剪贴板） |
| `/settings` | `src/app/(portal)/settings/page.tsx` | Server Component | 设置（密码/AI配置/数据导出） |
| `/admin` | `src/app/(portal)/admin/page.tsx` | Server Component | 管理员面板 |
| `/admin/enforcer` | `src/app/(portal)/admin/enforcer/page.tsx` | Server Component | 专注模式（Focus Enforcer） |
| `/admin/update-hub` | `src/app/(portal)/admin/update-hub/page.tsx` | Server Component | 版本历史详情 |

### API 路由

| 路由 | 文件 | 说明 |
|------|------|------|
| `/api/health` | `src/app/api/health/route.ts` | 健康检查端点 |
| `/api/legacy-sync` | `src/app/api/legacy-sync/route.ts` | 旧版 localStorage → 新版 API 数据同步桥 |
| `/api/llm-proxy` | `src/app/api/llm-proxy/route.ts` | 统一 LLM 代理（读取用户 AI 配置，转发请求） |

---

## 认证系统

### 支持的登录方式

| Provider | 说明 | 白名单策略 |
|----------|------|-----------|
| **GitHub OAuth** | Supabase Auth，授权后自动注册 | OAuth 自动信任（无需白名单） |
| **Google OAuth** | Supabase Auth，授权后自动注册 | OAuth 自动信任（无需白名单） |
| **Email / Password** | Supabase Auth，邮箱+密码登录 | 必须通过白名单检查 |

### 认证中间件流程（`src/middleware.ts`）

```
用户访问任意 Portal 路由
    ├─ 公开路由（/login, /auth/callback, /unauthorized 等） → 放行
    ├─ 未登录 → 重定向到 /login
    ├─ 已登录 + OAuth Provider（github/google） → 自动信任 → 放行
    ├─ 已登录 + Email Provider → 检查白名单
    │       ├─ 数据库 whitelist_emails 命中 OR 环境变量 AUTHORIZED_EMAILS 包含 → 放行
    │       └─ 白名单拒绝 → 重定向到 /unauthorized
    └─ 访问 /admin 路由
            ├─ 环境变量 ADMIN_USERS 或 AUTHORIZED_GITHUB_USERS 匹配 → admin
            ├─ profiles.role = 'admin' → admin
            └─ 否 → 重定向到 /unauthorized
```

**中间件匹配排除**：`_next/static`、`_next/image`、`favicon.ico`、所有静态资源文件（svg/png/jpg/gif/webp）。

### 白名单机制（双层）

1. **环境变量**（只读，在 `.env.local` 中配置）：
   - `AUTHORIZED_GITHUB_USERS` — GitHub 用户名白名单（逗号分隔）
   - `AUTHORIZED_EMAILS` — 邮箱白名单（逗号分隔）
   - `ADMIN_USERS` — 管理员 GitHub 用户名（逗号分隔，缺省回退到 AUTHORIZED_GITHUB_USERS）

2. **数据库白名单**（可在管理员面板动态管理）：
   - `whitelist_emails` 表 — 字段：`email`, `note`, `created_by`
   - `whitelist_usernames` 表 — 字段：`username`, `platform`, `note`, `created_by`

### 多账号关联

同一用户可以关联多个登录 Provider（存储在 `profiles.linked_providers` JSONB 数组中）：

- **关联账号**（Link Account）：管理员面板 → 第三方账号关联
- **取消关联**（Unlink）：管理员面板 → 移除某个 Provider
- **强制合并**（Force Merge）：将副账号的所有数据迁移到主账号，合并 linked_providers

### 密码管理

- Email 登录用户：可修改密码（需要当前密码验证）
- OAuth 用户：可通过邮件设置初始密码，或直接重置密码
- 密码重置流程：`/reset-password` → 邮件链接 → `/auth/callback?type=recovery` → `/update-password`

---

## 数据库表结构

### 用户与认证表

| Migration | 表名 | 核心字段 | 说明 |
|-----------|------|---------|------|
| `001` + `007` | `profiles` | id, github_username, username, email, display_name, avatar_url, role, linked_providers | 用户档案 + 自动创建触发器 |
| `008` | `whitelist_emails` | id, email, note, created_by | 数据库白名单邮箱 |
| `008` | `whitelist_usernames` | id, username, platform, note, created_by | 数据库白名单用户名 |

### 业务数据表

| Migration | 表名 | 核心字段 | 说明 |
|-----------|------|---------|------|
| `002` + `009` | `vocab_words` | word, meaning, category, mastered, review_count, status, stage, next_review, interval_minutes, learned_date, ex, cn | 词汇表（含 SRS 间隔复习） |
| `009` | `vocab_stats` | today_time, today_learned, today_reviewed, date | 每日学习统计 |
| `009` | `vocab_settings` | tts, rate, theme | 词汇学习设置 |
| `003` | `study_plans` | title, description, start_date, end_date | 学习计划 |
| `003` | `study_tasks` | title, completed, due_date, plan_id | 学习任务 |
| `013` | `study_syllabus` | subject_name, color, units (JSONB) | 课程大纲 |
| `013` | `study_config` | school_date, exam_date, emergency_subjects, emergency_deadline, emergency_note | 学习配置 |
| `013` | `study_mock_records` | user_id, subject, score, total, date | Mock 考试记录 |
| `004` + `011` | `poems` | title, author, content, mastery_level, best_time, completion_count | 诗词（含背诵统计） |
| `011` | `poem_sessions` | poem_id, time_seconds, retreats, study_mode_used, completed | 背诵记录 |
| `005` | `playlists` | name, description | 播放列表 |
| `005` | `tracks` | title, artist, url, sort_order, playlist_id | 曲目 |
| `010` | `music_songs` | netease_id, name, sort_order | 歌曲（网易云音乐 ID） |
| `010` | `music_settings` | manual_offset, interval_ms, play_mode | 音乐同步播放设置 |
| `006` + `012` | `countdowns` | title, target_date, description, color, sort_order | 倒计时事件 |
| `014` | `relax_chat` | role, content | AI 聊天历史 |
| `014` | `relax_state` | water_count, water_date, theme | 放松模块状态 |
| `015` | `user_settings` | key, value (JSONB) | 用户配置（如 ai_config） |

### 执行迁移

在 Supabase Dashboard > SQL Editor 中按序执行 `jackyun-portal/supabase/migrations/` 目录下的 SQL 文件（`001` → `015`）。

---

## 本地开发

### 前置要求

- Node.js 20+
- npm / pnpm / yarn
- Supabase 项目（本地或云端）

### 步骤

```bash
# 1. 进入项目目录
cd jackyun-portal

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local 填入真实的 Supabase 密钥

# 4. 启动开发服务器
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)

### 环境变量

参考 `jackyun-portal/.env.example`：

```env
# Supabase 连接
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# GitHub 用户名白名单（逗号分隔）
AUTHORIZED_GITHUB_USERS=YunfanShi

# Email 白名单（逗号分隔）
AUTHORIZED_EMAILS=w.jack2025a@gmail.com,w.jack2025a@outlook.com

# 管理员 GitHub 用户名（可选，逗号分隔）
# 如不设置，则使用 AUTHORIZED_GITHUB_USERS 作为管理员列表
ADMIN_USERS=YunfanShi

# 站点 URL
NEXT_PUBLIC_SITE_URL=https://jackyun.top
```

---

## 部署

项目支持部署到 Vercel 或任何支持 Node.js 的平台。

```bash
npm run build
npm run start
```

关键配置：
- `output: 'standalone'` 模式确保生产构建可独立运行
- 环境变量需在部署平台 Dashboard 中配置
- 自定义域名: `jackyun.top`
- 远程图片白名单：Google 头像 + GitHub 头像（在 `next.config.ts` 中）

---

## 全局 CSS 主题系统

所有组件统一使用 CSS 自定义属性，通过 `@media (prefers-color-scheme: dark)` 自动切换暗色模式。

### CSS 变量表

| 变量名 | 用途 | 亮色值 | 暗色值 |
|--------|------|--------|--------|
| `--background` | 页面背景 | `#ffffff` | `#0a0a0a` |
| `--foreground` | 主文字色 | `#171717` | `#ededed` |
| `--muted-foreground` | 次要文字色 | `#6b7280` | `#9ca3af` |
| `--card` | 卡片背景 | `#ffffff` | `#1a1a1a` |
| `--card-border` | 卡片边框 | `#e5e7eb` | `#2d2d2d` |
| `--sidebar-bg` | 侧边栏背景 | `#f8f9fa` | `#111111` |
| `--sidebar-border` | 侧边栏边框 | `#e5e7eb` | `#2d2d2d` |

### 品牌色

```typescript
brand: {
  blue: '#4285F4',
  red: '#EA4335',
  yellow: '#FBBC05',
  green: '#34A853',
}
```

### 字体

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
```

---

## 代码规范（指导 AI 编程）

以下规范是项目的强制编码约束，AI 助手在生成代码时必须严格遵守。

---

### 1. TypeScript 规范

#### 1.1 严格模式
`tsconfig.json` 中 `"strict": true`，禁止使用 `any`（除非必要），优先使用类型推断。

#### 1.2 路径别名
**必须**使用 `@/*` 代替相对路径：

```typescript
// ✅ 正确
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/types';

// ❌ 错误
import { createClient } from '../../lib/supabase/server';
```

#### 1.3 类型定义位置
- 模块专属类型 → `src/types/模块名.ts`（如 `countdown.ts`, `vocab.ts`, `music.ts`, `poem.ts`, `study.ts`, `relax.ts`）
- 通用/共享类型 → `src/types/index.ts`（如 `Profile`, `WhitelistInfo`, `SystemInfo`, `TableStat`）
- Props 接口 → 在组件文件中内联定义
- 使用 `import type { ... }` 导入纯类型

#### 1.4 Props 接口命名
```typescript
// 命名为 {组件名}Props
interface TopbarProps { user: User | null; }
interface LegacyFrameProps { src: string; title?: string; }
interface ProductCardProps { id: string; title: string; description: string; icon: string; color: string; href: string; }
```

---

### 2. 组件规范

#### 2.1 Server Component（默认模式）
- **默认不添加** `'use client'`，除非需要交互
- 适合：数据获取、静态渲染、SEO
- 示例文件：`dashboard/page.tsx`、`admin/page.tsx`、`settings/page.tsx`、`tools/page.tsx`

#### 2.2 Client Component（按需启用）
- **文件顶部必须添加** `'use client'` 指令
- 适合：需要 `useState`、`useEffect`、`useRouter`、`usePathname`、`useRef`、事件处理等交互逻辑
- 示例文件：`sidebar.tsx`、`ai-chat-fab.tsx`、`legacy-frame.tsx`、`keyboard-shortcuts.tsx`

#### 2.3 组件文件命名
- 文件名：`kebab-case.tsx`（如 `ai-chat-fab.tsx`、`legacy-frame.tsx`）
- 组件函数名：`PascalCase`（如 `AiChatFab`, `LegacyFrame`）
- **必须**默认导出：`export default function ComponentName() { ... }`

#### 2.4 组件目录结构
```
src/components/
├── admin/           # 管理员相关组件
│   ├── account-linking-panel.tsx
│   ├── change-password-panel.tsx
│   ├── enforcer-app.tsx
│   └── whitelist-panels.tsx
├── auth/            # 认证相关组件
│   ├── email-login-form.tsx
│   ├── google-login-button.tsx
│   ├── login-button.tsx
│   └── user-avatar.tsx
├── layout/          # 布局组件
│   ├── keyboard-shortcuts.tsx
│   ├── sidebar.tsx
│   └── topbar.tsx
├── modules/         # 功能模块组件
│   ├── ai-chat-fab.tsx
│   ├── latex-renderer.tsx
│   ├── legacy-bridge.tsx
│   ├── legacy-frame.tsx
│   ├── product-card.tsx
│   ├── countdown/
│   ├── music/
│   ├── poem/
│   ├── relax/
│   ├── study/
│   ├── tools/
│   └── vocab/
└── settings/        # 设置相关组件
    ├── ai-config-panel.tsx
    └── export-data-panel.tsx
```

---

### 3. Server Action 规范（`'use server'`）

#### 3.1 Action 文件位置
所有 Server Action 统一放在 `src/actions/` 目录下，每个文件顶部添加 `'use server'` 指令：

```
src/actions/
├── admin.ts      # 管理员操作
├── auth.ts       # 认证操作
├── countdown.ts  # 倒计时操作
├── export.ts     # 数据导出
├── music.ts      # 音乐播放器操作
├── poem.ts       # 诗词操作
├── relax.ts      # 放松模块操作
├── settings.ts   # 用户设置操作
├── study.ts      # 学习计划操作
└── vocab.ts      # 词汇操作
```

#### 3.2 用户认证模式（每个 Action 文件必须包含）
```typescript
async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthorized');
  return { supabase, user };
}
```

#### 3.3 权限检查模式
- **普通操作**：调用 `getAuthenticatedUser()` 获取 `supabase`（带 RLS）和 `user`
- **管理员操作**：调用 `requireAdmin()` 进行额外权限验证
- **所有数据库操作必须带上 `user_id` 过滤**（RLS 双重保障）：
  ```typescript
  await supabase.from('vocab_words').select('*').eq('user_id', user.id);
  ```

#### 3.4 数据刷新
修改数据后**必须**调用 `revalidatePath('/路由')` 确保页面缓存失效。

#### 3.5 Action 返回类型
优先使用 `Promise<{ success: boolean; error?: string }>` 模式返回可判定的结果，对于数据查询则直接返回数据或 throw。

---

### 4. CSS / 样式规范

#### 4.1 强制使用 CSS 变量
**禁止**使用硬编码颜色（如 `bg-white`, `text-black`, `bg-gray-100`），必须使用 `var()` 变量：

```tsx
// ✅ 正确
<div className="bg-[var(--background)] text-[var(--foreground)] border-[var(--card-border)]" />

// ❌ 错误
<div className="bg-white text-black border-gray-200" />
```

#### 4.2 品牌色使用
品牌色可直接内联使用（用于强调色、按钮色、图标色）：
```tsx
style={{ backgroundColor: `${color}1A` }}   // 品牌色 10% 透明度背景
style={{ color: '#4285F4' }}                 // 品牌蓝色文字
className="bg-[#4285F4] text-white"          // 品牌蓝色背景 + 白色文字
```

#### 4.3 通用样式模式

| 组件类型 | 推荐样式类名 |
|----------|-------------|
| 大卡片容器 | `rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5` |
| 小卡片 | `rounded-xl border border-[var(--card-border)] p-3` |
| 主标题 | `text-2xl font-bold text-[var(--foreground)]` |
| 副标题/描述 | `text-sm text-[var(--muted-foreground)] mt-1` |
| Section 标题 | `text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]` |
| 按钮过渡 | `hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors` |
| 卡片悬停 | `hover:-translate-y-1 hover:shadow-md transition-all duration-200` |

#### 4.4 `cn()` 工具函数
`src/lib/utils.ts` 提供 `cn()` 函数合并类名：
```typescript
import { cn } from '@/lib/utils';
// cn('base-class', isActive && 'active-class', className)
```

#### 4.5 暗色模式
- 通过 `@media (prefers-color-scheme: dark)` 自动响应系统主题
- **无需手动切换**，CSS 变量自动覆盖即可

---

### 5. 布局规范

#### 5.1 Portal 布局结构
`src/app/(portal)/layout.tsx` 定义了登录后的全局布局：

```tsx
<div className="flex h-screen overflow-hidden bg-[var(--background)]">
  <Sidebar />                           // 左侧折叠导航栏
  <div className="flex flex-1 flex-col overflow-hidden">
    <Topbar user={user} />              // 顶部栏（用户名 + 退出）
    <main className="flex-1 overflow-y-auto p-6">{children}</main>
  </div>
  <LegacyBridge />                      // 旧版 localStorage 同步桥
  <KeyboardShortcuts />                 // 键盘快捷键处理器
  <AiChatFab />                         // 右下角 AI 浮动聊天 FAB
</div>
```

#### 5.2 Sidebar 规范
- 使用 `'use client'`（需要 `usePathname`, `useState`）
- 支持折叠/展开（`collapsed` state，宽度 16 / 60）
- 活跃状态：蓝色高亮 `bg-[#4285F4]/10 text-[#4285F4]`
- 图标：使用 Material Icons Round

#### 5.3 Topbar 规范
- 使用 Server Component（接收 `user` props）
- 显示 `UserAvatar` 组件 + 退出登录按钮

---

### 6. Supabase 客户端使用规范

项目中 Supabase 客户端按使用场景分为三种：

| 文件 | 导入路径 | 使用场景 |
|------|---------|---------|
| `src/lib/supabase/server.ts` | `@/lib/supabase/server` | Server Component / Server Action / Route Handler |
| `src/lib/supabase/client.ts` | `@/lib/supabase/client` | Client Component（浏览器端） |
| `src/lib/supabase/middleware.ts` | `@/lib/supabase/middleware` | `middleware.ts` 中创建客户端 |

**Server 端使用示例**：
```typescript
import { createClient } from '@/lib/supabase/server';
const supabase = await createClient();
const { data, error } = await supabase.from('table').select('*').eq('user_id', user.id);
```

---

### 7. Middleware 规范

`src/middleware.ts` 负责：
1. 会话刷新（Session refresh via `@supabase/ssr`）
2. 公开路由放行（`PUBLIC_ROUTES` 数组：`/login`, `/auth/callback`, `/unauthorized`, `/reset-password`, `/update-password`）
3. 未登录重定向到 `/login`
4. 白名单/自动注册检查（OAuth 自动信任，Email 需白名单）
5. Admin 路由额外权限检查

**匹配模式**：
```typescript
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
```

---

### 8. Legacy Bridge 架构

`LegacyFrame` 组件（`src/components/modules/legacy-frame.tsx`）负责将旧版 HTML 页面嵌入新系统。

#### 8.1 加载流程
1. `fetch` 获取旧版 HTML 内容
2. 注入 `<base href>` 修复相对路径引用
3. 注入 CSS 隐藏所有旧版 API Key 输入框和配置面板
4. 注入 JS 拦截脚本（localStorage 伪装 + 请求代理）
5. 通过 `srcDoc` 渲染到 iframe 中

#### 8.2 API Key 隐藏（CSS 注入）
隐藏旧版页面中的以下元素：

| 目标 ID/Class | 所属页面 |
|---------------|----------|
| `#aiKeyInp`, `#apiKeyInput`, `#apiKey` | 通用 API Key 输入 |
| `#model-select`, `#config-modal` | Relax / J.A.R.V.I.S |
| `#key-deepseek`, `#key-qwen` | Relax 模块 |
| `#aiStatusBar`, `#apiProviderSel`, `#modelInput`, `#customEndpointRow`, `#customEndpointInput` | Goal 模块 |
| `#ai-panel-settings`, `#ai-tab-settings`, `#aiProvSel`, `#aiCustomEndpointRow`, `#aiCustomEndp`, `#aiCustomModel` | MockPortal 模块 |

#### 8.3 localStorage 伪装（JS 注入）
拦截 `localStorage.getItem`，返回占位符值用于以下 key：
`ds_key`, `warden_ai_key`, `llm_key`, `ai_key`, `api_key`, `jack_sk_ds`, `jack_sk_qw`, `openai_key`, `deepseek_key`, `ai_api_key`, `warden_key`, `ai_provider`, `ai_model`, `ai_custom_endpoint`

#### 8.4 LLM 请求拦截（JS 注入）
拦截 `fetch` 和 `XMLHttpRequest`，将对以下 LLM 服务商的 API 请求重定向到 `/api/llm-proxy`：

`api.openai.com`, `api.deepseek.com`, `api.anthropic.com`, `generativelanguage.googleapis.com`, `dashscope.aliyuncs.com`, `open.bigmodel.cn`, `api.moonshot.cn`, `api.minimax.chat`, `api.mistral.ai`, `api.groq.com`, `api.together.xyz`

#### 8.5 MutationObserver（JS 注入）
监听 DOM 变化，动态隐藏运行时创建的 AI 配置 UI 元素。

#### 8.6 iframe 沙盒配置
```tsx
sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-top-navigation"
```

---

### 9. AI 统一代理 (`/api/llm-proxy`)

- 读取用户 `user_settings` 表中的 `ai_config`（baseUrl, apiKey, model）
- 支持任意兼容 OpenAI `/chat/completions` 接口的 LLM 服务
- 支持流式响应（SSE, Server-Sent Events）
- 如果用户未配置 API Key，返回中文提示信息

---

### 10. 键盘快捷键

`KeyboardShortcuts` 组件（`src/components/layout/keyboard-shortcuts.tsx`）：

| 快捷键 | 功能 | 实现细节 |
|--------|------|---------|
| `g` + `d` | 跳转到 Dashboard | `g` 前缀 1 秒内超时 |
| `g` + `s` | 跳转到学习计划 | 同上 |
| `g` + `v` | 跳转到词汇宝库 | 同上 |
| `/` | 聚焦搜索框 | 查找 `input[type="search"]` 或含"搜索"的 placeholder |
| `Escape` | 关闭 Modal/Dialog | 查找 `[data-dismiss="modal"]` 或 `[aria-label="close"]` |

**重要**：在 `<input>`、`<textarea>`、`contentEditable` 元素中不触发任何快捷键。

---

### 11. 菜单导航项（完整列表）

侧边栏 `NAV_ITEMS`（`src/components/layout/sidebar.tsx`）：

| # | 标签 | 图标（Material Icons） | 路由 |
|---|------|----------------------|------|
| 1 | Dashboard | `dashboard` | `/dashboard` |
| 2 | 学习计划 | `school` | `/study` |
| 3 | 词汇宝库 | `menu_book` | `/vocab` |
| 4 | 音乐播放器 | `music_note` | `/music` |
| 5 | 诗词天地 | `auto_stories` | `/poem` |
| 6 | 倒计时 | `timer` | `/countdown` |
| 7 | 放松一下 | `sports_esports` | `/relax` |
| 8 | 控制中心 | `tune` | `/control` |
| 9 | 答题卡 | `content_paste` | `/answer-sheet` |
| 10 | 计划显示器 | `flag` | `/goal` |
| 11 | 考试倒计时 | `hourglass_empty` | `/igcountdown` |
| 12 | 更新日志 | `history` | `/update-hub` |
| 13 | Mock 刷题 | `quiz` | `/mock-portal` |
| 14 | 工具箱 | `build` | `/tools` |
| 15 | 设置 | `settings` | `/settings` |
| 16 | 管理员 | `admin_panel_settings` | `/admin` |

---

### 12. 功能模块详解

#### 12.1 Dashboard (`/dashboard`)
- 欢迎语：从 `user_metadata.full_name` / `user_name` 获取
- 统计卡片：词汇总数（`vocab_words` count）、已掌握词汇（`mastered = true` count）、任务完成率（`study_tasks` completed/total）
- 产品卡片导航网格（响应式：`grid-cols-1 sm:2 lg:3 xl:4`）
- 卡片悬停效果：上移 1px + 阴影 + 顶部品牌色条展开动画

#### 12.2 学习计划 (`/study`)
- 嵌入旧版 `Studyplan.html`（Legacy Frame）
- 课程大纲管理（`study_syllabus`）：按科目单元步进
- 学习配置（`study_config`）：开学日期、考试日期、紧急科目/截止日期
- Mock 考试记录（`study_mock_records`）

#### 12.3 词汇宝库 (`/vocab`)
- 嵌入旧版 `Vocab.html`（Legacy Frame）
- SRS（间隔重复）算法：`status`（new/learning/review/mastered）、`stage`、`next_review`、`interval_minutes`
- TTS 发音设置
- 每日学习统计（`vocab_stats`）
- 批量导入功能

#### 12.4 音乐播放器 (`/music`)
- 嵌入旧版 `MusicPlayer.html`（Legacy Frame）
- 网易云音乐 ID 歌曲库（`music_songs`）
- NTP 时间同步播放
- 播放设置：手动偏移 `manual_offset`、间隔 `interval_ms`、播放模式 `play_mode`

#### 12.5 诗词天地 (`/poem`)
- 嵌入旧版 `Poem.html`（Legacy Frame）
- 背诵模式：计时、退却次数统计
- 掌握度评级（0-5）
- 背诵会话记录（`poem_sessions`）：最佳时间、完成次数

#### 12.6 倒计时 (`/countdown`)
- 嵌入旧版 `Countdown.html`（Legacy Frame）
- 支持拖拽排序（`sort_order`）
- 批量导入事件

#### 12.7 放松一下 (`/relax`)
- 嵌入旧版 `Relax.html`（Legacy Frame）
- AI 聊天（`relax_chat` 持久化）
- 番茄钟、呼吸练习、喝水追踪、白噪音生成、调色板

#### 12.8 控制中心 (`/control`)
- 嵌入旧版 `Control.html`（Legacy Frame）
- 系统快捷控制

#### 12.9 答题卡 (`/answer-sheet`)
- 嵌入旧版 `AnswerSheet.html`（Legacy Frame）

#### 12.10 计划显示器 (`/goal`)
- 嵌入旧版 `Goal.html`（Legacy Frame）

#### 12.11 考试倒计时 (`/igcountdown`)
- 嵌入旧版 `IGCountdown.html`（Legacy Frame）

#### 12.12 Mock 刷题 (`/mock-portal`)
- 嵌入旧版 `MockPortal.html`（Legacy Frame）

#### 12.13 更新日志 (`/update-hub`)
- 嵌入旧版 `UpdateHub.html`（Legacy Frame）

#### 12.14 工具箱 (`/tools`)
- 原生 Next.js Server Component
- 文本工具（Text Tools）：大文字转换、排版
- 时间同步（Time Sync）
- 剪贴板共享（Clipboard Share）

#### 12.15 设置 (`/settings`)
- 账户安全：修改密码 / 邮件重置密码
- AI 配置：baseUrl + apiKey + model（存储在 `user_settings` 表的 `ai_config` key）
- 数据导出：JSON / CSV 格式导出全部用户数据

#### 12.16 管理员 (`/admin`)
- 用户信息展示：头像、用户名、GitHub 用户名、登录方式、用户 ID
- 白名单配置：环境变量只读展示 + 数据库白名单动态管理
- 账号关联：Link/Unlink Provider + Force Merge
- 管理工具：版本历史 + 专注模式
- 退出登录

#### 12.17 专注模式 (`/admin/enforcer`)
- Focus Enforcer 强制专注计时器

#### 12.18 版本历史 (`/admin/update-hub`)
- 时间线展示版本更新记录（v1.6 → v1.5.5 → v1.0.0）
- 模块状态面板：Poem 沉浸背诵、Vocab Master、ADN、LexiconLab、Battlefield 6 Hub、Vocab Flow

---

### 13. 文件命名规范总结

| 类型 | 命名规则 | 示例 |
|------|---------|------|
| 页面文件 | `page.tsx`（Next.js 固定命名） | — |
| 路由文件 | `route.ts`（Next.js 固定命名） | — |
| 布局文件 | `layout.tsx`（Next.js 固定命名） | — |
| 组件文件 | `kebab-case.tsx` | `ai-chat-fab.tsx` |
| 组件函数 | `PascalCase` | `AiChatFab` |
| 类型文件 | `kebab-case.ts` | `countdown.ts` |
| Action 文件 | `kebab-case.ts` | `auth.ts` |
| Props 接口 | `{组件名}Props` | `TopbarProps` |
| Migration SQL | `{序号}_{描述}.sql` | `001_create_profiles.sql` |

---

### 14. 禁止事项（红线）

- ❌ **禁止使用硬编码颜色**（如 `bg-white`、`text-black`、`bg-gray-200`），必须使用 `var()` CSS 变量
- ❌ **禁止在 Server Action 中不进行用户认证**
- ❌ **禁止在数据库查询中不使用 `user_id` 过滤**
- ❌ **禁止在不需要交互的组件中添加 `'use client'`**
- ❌ **禁止使用相对路径导入**，统一使用 `@/` 别名
- ❌ **禁止在 `middleware.ts` 中直接使用 `next/headers` 的 `cookies()`**（应使用 `@supabase/ssr` 的 createClient）
- ❌ **禁止忽略 TypeScript 严格模式错误**（`"strict": true` 不可关闭）

---

### 15. AI 编程检查清单

在编写任何代码前，AI 助手应确认：

- [ ] 文件是否应使用 `'use client'`？
- [ ] 是否使用了 `@/*` 路径别名导入？
- [ ] CSS 颜色是否使用了 `var()` 变量而非硬编码？
- [ ] Server Action 是否调用了 `getAuthenticatedUser()`？
- [ ] 数据库操作是否带上了 `user_id` 过滤？
- [ ] 修改数据后是否调用了 `revalidatePath()`？
- [ ] Props 接口是否命名为 `{组件名}Props`？
- [ ] 新类型是否定义在 `src/types/` 中？
- [ ] 文件名是否符合 `kebab-case` 规范？
- [ ] 组件是否默认导出？

---

## 原有 HTML 页面说明

根目录下的旧版 `.html` 文件是由 Gemini Pro / Claude Sonnet 构建的独立功能页面，已通过 `jackyun-portal/public/` 目录部署为新版系统的静态资源，并由 Legacy Bridge 机制统一管理 API 密钥和 LLM 请求代理。

**技术债**：旧版页面正在逐步迁移到 Next.js 原生组件，当前策略是通过 iframe + 注入脚本实现兼容过渡。

---

## 许可证

Private — JackYun Personal Portal，仅供个人使用。

---

> Built with ❤️ by Yunfan Shi | [jackyun.top](https://jackyun.top)