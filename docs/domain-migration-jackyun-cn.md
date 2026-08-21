# JackYun 域名迁移清单

状态：待注册并绑定 `jackyun.cn`。当前生产域名仍为 `jackyun.top`，本文件不代表域名已购买或 DNS 已切换。

## 迁移前门槛

- [ ] 在注册商确认 `jackyun.cn` 可注册、续费价格、实名认证和备案要求。
- [ ] 确认品牌/商标使用权，并保存注册订单与 DNS 控制权记录。
- [ ] 新域名 HTTPS 可用，且 `/Techempire`、登录页和 API 均返回预期响应。
- [ ] 生成并保存新域名专用 OAuth 回调清单。
- [ ] 完成 Chrome/Edge Companion 的新正式身份和 OAuth 测试后，才允许发布扩展。

## 代码与平台引用清单

| 位置 | 当前值 | 迁移动作 | 回滚值 |
|---|---|---|---|
| `CNAME` / `public/CNAME` | `jackyun.top` | 新站验证后切换为 `jackyun.cn` | `jackyun.top` |
| `.env` / Vercel 环境 | `NEXT_PUBLIC_SITE_URL` | 改为 `https://jackyun.cn` | `https://jackyun.top` |
| Supabase Auth | Site URL 与 Redirect URLs | 新增精确新域名回调，验证后再移除旧回调 | 保留旧域名 |
| Google/GitHub/Apple OAuth | 旧 callback | 新增并验证新域名 callback | 保留旧 callback |
| Companion | `PORTAL` 与 host permissions | 新包同时验证新域名，正式切换后移除旧域名 | 旧域名 |
| Userscript | `@namespace` / `@match` | 发行新版本并保留旧域名过渡期 | 旧域名 |
| 旧 HTML | 多处 `https://jackyun.top` | 分批替换；外部链接保留兼容跳转 | 旧链接 |
| 邮件/元数据 | `NEXT_PUBLIC_SITE_URL` 派生 | 新域名验证后重新发送/发布 | 旧链接 |

## 执行顺序

1. 绑定新域名并验证 HTTPS、静态资源、健康检查和 `/Techempire`。
2. 在 Supabase、OAuth 提供商和部署平台新增精确回调，不删除旧配置。
3. 双域名验证登录、密码重置、OAuth、API、Study Guide 本地进度和旧 HTML。
4. 更新代码、扩展 host permissions、Userscript 元数据和站点 canonical。
5. 重新打包 Companion，记录 Item ID、扩展 ID、公钥指纹和 OAuth 回调。
6. 新域名稳定运行一个完整发布周期后，旧域名做 308 跳转。
7. 至少保留旧域名一个完整发布周期，再评估删除旧回调。

## 回滚方案

在 DNS、部署平台和 Supabase 中保留旧配置。若新域名出现登录、OAuth、资源或 API 故障：

1. 将 DNS/部署入口恢复到 `jackyun.top`。
2. 将 `NEXT_PUBLIC_SITE_URL` 恢复为旧域名并重新部署。
3. 暂不撤销旧 OAuth Redirect URLs。
4. Companion 下载入口回到暂停状态，避免发出域名不一致的新包。
5. 记录故障时间、受影响流程和恢复验证结果。
