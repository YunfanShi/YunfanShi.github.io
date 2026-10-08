# 本地开发环境

项目目录：`/Users/shiyunfan/JACKYUN/jackyun-portal`

已使用 Node.js 24 和 npm 按 `package-lock.json` 安装依赖。`.nvmrc` 指定 Node.js 24；项目最低要求是 Node.js 22。Docker Desktop 位于 `/Applications/Docker.app`，Supabase CLI 通过 Homebrew 安装。

## 启动

先打开 Docker Desktop，然后执行：

```bash
cd /Users/shiyunfan/JACKYUN/jackyun-portal
supabase start
npm run dev -- --hostname 127.0.0.1
```

- 网站：http://127.0.0.1:3000
- Supabase Studio：http://127.0.0.1:54323
- 本地测试邮件：http://127.0.0.1:54324
- 数据库：`postgresql://postgres:postgres@127.0.0.1:54322/postgres`

Supabase 使用项目内 `supabase/config.toml` 和迁移文件创建独立的本地数据库。首次启动需要下载容器镜像。

本地连接配置保存在 `jackyun-portal/.env.local`，该文件已被 Git 忽略。数据库 URL 和密钥可通过 `supabase status` 查看。不要把服务端密钥复制到 `NEXT_PUBLIC_` 变量中。

GitHub、Google 等第三方登录需要另外配置 OAuth 提供商；本地开发可使用邮箱登录，在测试邮件页面查看验证码。AI、Resend 和其他第三方集成需要相应服务的配置。

## 检查

```bash
npx next typegen
npx tsc --noEmit
npm run build
npm run lint
```

初次安装时 TypeScript 检查、生产构建和 49 项认证与恢复测试通过；浏览器首页正常显示，没有页面错误；`/api/health` 返回 `ok`。本地数据库已应用全部 73 个迁移，建立 81 张 public 表。

ESLint 报告仓库原有的 16 个错误和 1 个警告，因此完整的 `npm run verify` 暂时会在 lint 阶段停止。

## 停止与重新安装依赖

网站开发终端按 `Ctrl+C`。停止本地数据库并保留数据：

```bash
supabase stop
```

重新按锁文件安装依赖：

```bash
npm ci
```
