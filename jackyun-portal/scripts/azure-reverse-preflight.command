#!/bin/bash
# macOS: double-click. Read-only, no saved passwords, no production switch.
set -euo pipefail
set +x
umask 077
TASK_DIR="$(cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$TASK_DIR"
trap 'unset SOURCEPGPASSWORD TARGETPGPASSWORD; printf "\n检查已结束，密码已从此进程清除。\n"; read -r -p "按回车关闭窗口…" _ || true' EXIT
printf 'Azure 回退只读预检\n不会修改数据库、冻结写入或切换生产。\n'
if ! command -v node >/dev/null || ! node -e 'if(Number(process.versions.node.split(".")[0])<24)process.exit(1)' ; then
  printf '需要 Node.js 24 或更新版本。\n'; exit 1
fi
if [[ ! -d azure/backend/node_modules/pg ]]; then
  printf '正在安装锁定的后台依赖…\n'
  (cd azure/backend && npm ci --ignore-scripts --no-audit --no-fund)
fi
mkdir -p .migration-private
if [[ -L .migration-private ]]; then printf '迁移目录不能是符号链接。\n'; exit 1; fi
chmod 700 .migration-private
printf '\n请从 Supabase 项目 Database Settings 的 SSL Configuration 下载 CA 证书。\n'
printf '把证书文件拖入此窗口或输入绝对路径，然后回车：'
IFS= read -r SOURCEPGSSLROOTCERT
# Accept Finder's escaped spaces without evaluating shell code.
SOURCEPGSSLROOTCERT="${SOURCEPGSSLROOTCERT//\\ / }"
SOURCEPGSSLROOTCERT="${SOURCEPGSSLROOTCERT#\'}"; SOURCEPGSSLROOTCERT="${SOURCEPGSSLROOTCERT%\'}"
SOURCEPGSSLROOTCERT="${SOURCEPGSSLROOTCERT#\"}"; SOURCEPGSSLROOTCERT="${SOURCEPGSSLROOTCERT%\"}"
if [[ ! -f "$SOURCEPGSSLROOTCERT" ]]; then printf '证书文件不存在。\n'; exit 1; fi
export SOURCEPGSSLROOTCERT
export TARGETPGSSLROOTCERT="$TASK_DIR/.migration-private/system-trusted-roots.pem"
node --input-type=module -e 'import tls from "node:tls";import fs from "node:fs";fs.writeFileSync(process.env.TARGETPGSSLROOTCERT,[...new Set([...tls.getCACertificates("bundled"),...tls.getCACertificates("system")])].join("\n"),{mode:0o600});'
if ! node scripts/azure-network-preflight.mjs; then
  printf '\n网络或 TLS 检查失败，尚未请求密码。请先处理上面的失败步骤。\n'
  exit 1
fi
printf '\n输入 Supabase 数据库密码（不是网站登录密码，输入不显示）：'
IFS= read -r -s SOURCEPGPASSWORD; printf '\n'
printf '输入 Azure PostgreSQL 的 jackyun_admin 密码（不是微软账号密码，输入不显示）：'
IFS= read -r -s TARGETPGPASSWORD; printf '\n'
export SOURCEPGPASSWORD TARGETPGPASSWORD
if [[ -z "$SOURCEPGPASSWORD" || -z "$TARGETPGPASSWORD" ]]; then printf '密码不能为空。\n'; exit 1; fi
printf '正在使用 TLS 验证证书并逐表核对，最多需要几分钟…\n'
node scripts/azure-sync-reverse-copy.mjs --preflight
printf '\n检查报告已保存在上面 archive 路径内的 summary.json。\n本命令只核对已切换后的回退前提，不回灌、不解冻、不改变入口。\n'
