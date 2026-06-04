# JackYun Personal Portal

> 个人全能管理系统 — Built with Next.js 15 + Supabase

## 项目架构

本仓库包含两部分：

| 目录 | 说明 |
|------|------|
| 根目录（`*.html`） | 旧版静态 HTML 页面（历史遗留，待迁移） |
| `jackyun-portal/` | **新版** Next.js + Supabase 全栈应用 |

## 技术栈

- **框架**: [Next.js 15](https://nextjs.org/) (App Router)
- **后端/数据库**: [Supabase](https://supabase.com/) (PostgreSQL + Auth)
- **样式**: [Tailwind CSS 4](https://tailwindcss.com/)
- **认证**: GitHub OAuth via Supabase Auth
- **语言**: TypeScript 5

## 功能模块

- 🏠 **Dashboard** — 产品卡片导航中心
- 📚 **学习计划** — 制定并跟踪学习目标
- 📖 **词汇宝库** — 英语词汇积累与复习
- 🎵 **音乐播放器** — 播放列表管理
- 📜 **诗词天地** — 经典诗词收录与背诵
- ⏱️ **倒计时** — 重要日期提醒
- 🎮 **放松一下** — 游戏与娱乐
- 🔧 **工具箱** — 实用小工具
- ⚙️ **管理员** — 系统管理

## 本地开发

### 前置要求

- Node.js 20+
- npm / pnpm / yarn

### 步骤

\`\`\`bash
# 1. 进入项目目录
cd jackyun-portal

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local 填入真实的 Supabase 密钥

# 4. 启动开发服务器
npm run dev
\`\`\`

访问 [http://localhost:3000](http://localhost:3000)

### 环境变量

参考 \`jackyun-portal/.env.example\`：

\`\`\`env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
AUTHORIZED_GITHUB_USERS=YunfanShi
NEXT_PUBLIC_SITE_URL=https://jackyun.top
\`\`\`

## 数据库迁移

在 Supabase Dashboard > SQL Editor 中按序执行 \`jackyun-portal/supabase/migrations/\` 目录下的 SQL 文件：

1. \`001_create_profiles.sql\` — 用户档案 + 自动创建触发器
2. \`002_create_vocab.sql\` — 词汇表
3. \`003_create_study_plans.sql\` — 学习计划与任务
4. \`004_create_poems.sql\` — 诗词
5. \`005_create_music.sql\` — 播放列表与曲目
6. \`006_create_countdowns.sql\` — 倒计时事件

## 认证说明

- 使用 GitHub OAuth，通过 Supabase Auth 处理
- 白名单控制：只有 \`AUTHORIZED_GITHUB_USERS\` 中列出的 GitHub 用户名可以访问
- 未登录 → 重定向到 \`/login\`
- 已登录但未授权 → 重定向到 \`/unauthorized\`

## 部署

项目支持部署到 Vercel 或任何支持 Node.js 的平台。

\`\`\`bash
npm run build
npm run start
\`\`\`

自定义域名: \`jackyun.top\`

---

> 旧版文件由 Gemini Pro/Claude Sonnet 构建，作者仍在学习编程。
