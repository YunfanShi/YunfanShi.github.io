# Windows 本地开发（3.19.2）

## 前置环境

- Node.js 24 LTS（本次安装 24.19.0）与 npm。
- Docker Desktop，Linux 容器，WSL 2 后端；硬件虚拟化需开启。
- Git；Supabase CLI 2.119.0 作为项目开发依赖，由 `npm ci` 安装。

WSL 需要管理员授权。首次安装/启用 VirtualMachinePlatform 后如提示重启，请保存工作并重启，再打开 Docker Desktop，等引擎就绪。

官方安装参考：[Docker Windows](https://docs.docker.com/desktop/setup/install/windows-install/)、[WSL](https://learn.microsoft.com/en-us/windows/wsl/install)、[Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)。

## 启动

在 `jackyun-portal/` 打开 PowerShell：

```powershell
npm ci
npm run db:start
npm run db:check
npm run dev:local
```

如果 PowerShell 阻止 npm.ps1，请使用 `npm.cmd`，无需更改系统执行策略。重新打开终端以加载安装后的 PATH。

数据库为本机专用测试实例 `jackyun-portal-test`，容器 `supabase_db_jackyun-portal-test` 和对应数据卷与线上隔离。首次启动会下载 Docker 镜像并按仓库迁移创建空数据库，不复制生产用户或数据。不存在 seed.sql，因此关闭自动 seed。默认端口如被其他本地 Supabase 占用，应先停止另一个实例。

| 服务 | 地址 |
| --- | --- |
| 网站 | http://localhost:3000 |
| Supabase API | http://127.0.0.1:54321 |
| PostgreSQL | postgresql://postgres:postgres@127.0.0.1:54322/postgres |
| Studio | http://127.0.0.1:54323 |
| 本地邮件 | http://127.0.0.1:54324 |

`db:start` 和 `dev:local` 从本地 CLI 状态自动生成 `.env.local`，加入本机密钥、站点地址和独立随机加密密钥。文件被 Git 忽略；已有远端数据库配置会使脚本停止，先自行保存并重命名该配置再启动。已有加密密钥会保留。不要运行 `supabase link` 或把生产数据库密钥填入此环境。

## 测试与账户

```powershell
npm run db:check
npm run db:test
npm run lint
npm run test:sync
```

`db:check` 实际查询本机数据库版本、迁移记录和 profiles 表。`db:test` 运行现有备份中心 SQL 回归测试，事务回滚，不保留测试数据。

本地注册 `developer@example.test` 用于管理功能测试；此邮箱被本地配置设为白名单和管理员。未启用邮件确认，测试邮件只进入本地邮件服务。GitHub/Google OAuth、云端 AI 与第三方服务需要另行配置测试凭据；无须生产凭据即可测试基础页面和邮箱登录。

## 本次安装状态（2026-10-06）

本机已安装 Node.js 24.19.0、Docker Desktop 4.94.0、WSL 3.0.1 和项目依赖。微软签名的 WSL MSI 安装返回 0，启用虚拟机功能返回 `RestartNeeded: True`。需要重启 Windows 才能启动 Docker Linux 引擎；因此本地数据库、迁移链和 SQL 回归测试尚未完成实际运行验证。重启后按上面的启动和测试命令继续验证。

安装后验证：修改文件的 ESLint、密钥检查、远端 URL 启动拦截，以及同步回归 33/33 通过。`npx next typegen` 生成路由类型后，`npx tsc --noEmit` 通过。全仓库 `npm run lint` 存在 16 个既有错误和 1 个警告（旧页面链接、effect 内状态更新和旧测试类型），本次未修改这些业务代码。

## 停止与重建

### 重启后 Docker 仍提示虚拟机平台未启用

先在管理员 PowerShell 核对实际状态，不要仅凭 Docker 提示重复启用功能：

```powershell
Get-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform
Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux
Get-Service vmcompute,hns -ErrorAction SilentlyContinue
Test-Path C:\Windows\System32\vmcompute.exe
```

本机首次重启后，两个功能均为 Enabled，固件虚拟化已开启，但 vmcompute/hns 服务和 vmcompute.exe 缺失，Docker 重启仍失败。DISM 扫描另检出可修复的组件存储损坏；这并不证明该损坏就是服务缺失的原因。

可按 [微软 Windows 映像修复说明](https://learn.microsoft.com/en-us/windows-hardware/manufacture/desktop/repair-a-windows-image?view=windows-11) 使用管理员 PowerShell 扫描，检测到可修复损坏时执行修复：

```powershell
DISM.exe /Online /Cleanup-Image /ScanHealth
DISM.exe /Online /Cleanup-Image /RestoreHealth
```

修复结束后仍需检查计算服务、Docker 引擎及 `npm run db:check`。若功能重装提示 RestartNeeded，应再次重启；不能把功能状态 Enabled 或安装命令成功视为数据库已运行。

### 停止数据库

```powershell
npm run db:stop
```

正常停止保留本地数据。只有确定要删除本机测试数据时，才手动执行 `npx supabase db reset --local --yes`；这会重放迁移并清空测试数据。启动脚本不会自动执行 reset、push 或线上迁移。
