#!/bin/bash
set -euo pipefail
set +x
umask 077
TASK_DIR="$(cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$TASK_DIR"
trap 'unset TARGETPGPASSWORD; printf "\n密码已从此进程清除。\n"; read -r -p "按回车关闭窗口…" _ || true' EXIT
printf 'Azure 基线保护与配套安装\n保留 Azure 现有同步数据；不连接或复制 Supabase，不切换网站。\n'
export TARGETPGSSLROOTCERT="$TASK_DIR/.migration-private/system-trusted-roots.pem"
if [[ ! -f "$TARGETPGSSLROOTCERT" ]]; then printf '缺少已配置的 Azure 可信 CA。\n';exit 1;fi
printf '\n输入 Azure PostgreSQL jackyun_admin 密码（输入不显示）：'
IFS= read -r -s TARGETPGPASSWORD;printf '\n'
export TARGETPGPASSWORD
node scripts/azure-baseline-prepare.mjs
