# JackYun 阿里云与新域名迁移手册

状态：阿里云服务器已准备；新域名尚未确定。本文使用 `<NEW_DOMAIN>` 占位，不假定域名已经购买、备案、解析或签发证书。当前生产域名仍为 `jackyun.top`。

## 迁移前门槛

- [ ] 确定并注册新域名，确认续费价格、实名、备案及品牌风险。
- [ ] 给服务器创建非 root 运行用户，启用安全组最小端口（SSH、HTTP、HTTPS），SSH 禁止密码直登。
- [ ] 安装受支持的 Node.js LTS、Nginx，并配置系统时间、自动安全更新和日志轮转。
- [ ] 在 `/etc/jackyun-portal.env` 写入生产环境变量；权限设为仅运行用户/管理员可读。
- [ ] 先用临时主机名或本机 hosts 验证，不直接切换生产 DNS。
- [ ] 新域名 HTTPS、`/api/health`、登录、密码重置、OAuth、API、Study Guide 和旧 HTML 全部通过。
- [ ] 数据库备份和恢复演练完成；旧站仍可一键回滚。

## 可直接复用的部署文件

- `jackyun-portal/deploy/nginx.conf.example`：HTTPS 反向代理、流式响应与静态资源缓存模板。
- `jackyun-portal/deploy/jackyun-portal.service.example`：以非 root 用户运行 standalone 构建的 systemd 服务。
- `jackyun-portal/deploy/deploy.sh.example`：在服务器发布目录中进行构建、拷贝静态资源并原子切换版本的参考脚本。

所有示例都必须先替换 `example.com`、路径和用户名。密钥只写入服务器环境文件，不提交到 Git。

## 域名与平台引用清单

| 位置 | 当前值 | 迁移动作 | 回滚值 |
|---|---|---|---|
| DNS | `jackyun.top` | 先给 `<NEW_DOMAIN>` 设置较短 TTL，验证后再切主入口 | 旧站 IP/记录 |
| `.env` | `NEXT_PUBLIC_SITE_URL` | 改为 `https://<NEW_DOMAIN>` 后重新构建 | `https://jackyun.top` |
| Supabase Auth | Site URL 与 Redirect URLs | 先新增精确的新域名回调，稳定后才移除旧项 | 保留旧域名 |
| Google/GitHub/Apple OAuth | 旧 callback | 新增并验证新域名 callback | 保留旧 callback |
| Companion | `PORTAL` 与 host permissions | 新包同时验证新域名，正式切换后移除旧域名 | 旧域名 |
| Userscript | `@namespace` / `@match` | 发行兼容双域名的新版本 | 旧域名版本 |
| 旧 HTML | 多处 `https://jackyun.top` | 分批更新；过渡期保留兼容跳转 | 旧链接 |
| TR3000 强制主页 | `https://jackyun.top/network-access` | 登记接口和 HTTPS 验证后再切换 | 旧 URL |
| 邮件/元数据 | 由站点 URL 派生 | 新域名验证后重新发送/发布 | 旧链接 |

## 推荐执行顺序

1. 在阿里云安装运行环境，创建 `/opt/jackyun-portal/releases`、`shared` 与日志目录。
2. 上传代码或构建产物，执行 `npm ci`、全量检查和 `npm run build`。
3. 部署 `.next/standalone`，补齐 `.next/static` 与 `public`，启动 systemd 服务。
4. Nginx 先绑定临时主机名；验证健康检查、静态资源、流式 AI 响应和上传限制。
5. 在 Supabase、OAuth 提供商新增新域名回调，不删除旧配置。
6. 通过 hosts 或测试子域完成登录、密码重置、OAuth、API、Study Guide 本地进度和旧模块回归。
7. 将新域名 DNS 指向阿里云，签发证书并监控 4xx/5xx、延迟、CPU、内存与磁盘。
8. 验证 Companion、Userscript、邮件链接和 `/network-access` 后再切外围入口。
9. 稳定运行一个完整发布周期后，让旧域名做 308 跳转；旧 OAuth 回调再延后移除。

## 发布与验收命令

```bash
npm ci
npm run lint -- --quiet
npm run test:security
npm run test:network-access
npm run check:secrets
npm run check:companion
npm run check:study-guide
npm run build
```

服务器验收至少包括：

```bash
curl --fail --silent https://<NEW_DOMAIN>/api/health
systemctl status jackyun-portal
journalctl -u jackyun-portal --since '30 minutes ago'
nginx -t
```

## 回滚方案

每次发布保留上一版 release，`current` 软链接指向当前版本。若新站出现登录、OAuth、资源或 API 故障：

1. 将 `current` 切回上一 release，重启 `jackyun-portal`。
2. 将 DNS/入口恢复到旧站，并将 `NEXT_PUBLIC_SITE_URL` 恢复为 `https://jackyun.top`。
3. 不撤销旧 OAuth Redirect URLs，不迁移或覆盖唯一数据库副本。
4. Companion 与路由器入口恢复旧域名。
5. 记录故障时间、受影响流程、回滚版本和恢复验证结果。

## 当前仍需你的决定

只有新域名本身需要你确认。确定后，全局替换 `<NEW_DOMAIN>` / `example.com`，并逐项执行上面的双域验证流程；在此之前不要修改生产 DNS 或删除旧回调。
