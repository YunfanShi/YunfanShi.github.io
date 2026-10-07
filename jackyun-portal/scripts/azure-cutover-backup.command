#!/bin/bash
set -euo pipefail
set +x
umask 077
TASK_DIR="$(cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$TASK_DIR"
trap 'unset SOURCEPGPASSWORD TARGETPGPASSWORD; printf "\n密码已从此进程清除。\n"; read -r -p "按回车关闭窗口…" _ || true' EXIT
printf 'Azure 切换前两端备份\n只备份 public auth jackyun_private，不冻结写入、不切换网站。\n'
export SOURCEPGSSLROOTCERT="$TASK_DIR/../prod-ca-2021.crt"
export TARGETPGSSLROOTCERT="$TASK_DIR/.migration-private/system-trusted-roots.pem"
if [[ ! -f "$SOURCEPGSSLROOTCERT" || ! -f "$TARGETPGSSLROOTCERT" ]]; then
  printf '请先运行 azure-preflight.command 配置可信 CA。\n';exit 1
fi
node scripts/azure-network-preflight.mjs
printf '\n输入 Supabase 数据库密码（输入不显示）：'
IFS= read -r -s SOURCEPGPASSWORD;printf '\n'
printf '输入 Azure PostgreSQL jackyun_admin 密码（输入不显示）：'
IFS= read -r -s TARGETPGPASSWORD;printf '\n'
export SOURCEPGPASSWORD TARGETPGPASSWORD
node scripts/azure-cutover-backup.mjs
