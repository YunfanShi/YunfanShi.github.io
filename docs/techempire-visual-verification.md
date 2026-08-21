# /Techempire 页面验证

截图：

- [桌面截图](./screenshots/techempire-desktop.png)
- [手机截图](./screenshots/techempire-mobile.png)

已验证：

- 未登录本地请求 `/Techempire` 返回 200，页面不含 Portal 外壳。
- `/techempire` 返回 308 并指向 `/Techempire`。
- 页面标题为 `TECH EMPIRE · 科技帝国`。
- 页面明确标记为虚构企业/文明世界观。
- 390px 移动视口 `scrollWidth === innerWidth`，无横向溢出。
- 页面为 Server Component，无 Supabase、表单、数据库或自动播放音频。
- 内容未包含现实学校、宿舍地址、联系人、寝室号或未授权个人姓名。
