#!/bin/bash
set -euo pipefail
set +x
umask 077
TASK_DIR="$(cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$TASK_DIR"
trap 'unset AZURE_TEST_EMAIL AZURE_TEST_PASSWORD; printf "\n账号输入已从此进程清除。\n"; read -r -p "按回车关闭窗口…" _ || true' EXIT
printf '真实登录与 Azure 读取验收\n只读取同步接口，不修改同步数据、不封禁账号、不切换网站。\n'
printf '\n输入 JackYun 登录邮箱：'
IFS= read -r AZURE_TEST_EMAIL
printf '输入 JackYun 网站登录密码（输入不显示）：'
IFS= read -r -s AZURE_TEST_PASSWORD; printf '\n'
export AZURE_TEST_EMAIL AZURE_TEST_PASSWORD
node scripts/azure-real-login-check.mjs
