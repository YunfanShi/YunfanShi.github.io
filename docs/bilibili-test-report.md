# Bilibili Evolved 替换与测试记录

记录日期：2026-08-21
收录版本：v2.11.2  
官方来源：<https://github.com/the1812/Bilibili-Evolved>

## 已完成

- 已移除旧 `AdvMaple/bilibili-subtitle-download-plugin` 条目。
- 已改为官方 GitHub 仓库与首页 userscript 安装地址。
- 页面明确本体安装后还要在组件管理中安装“下载字幕”。
- 页面明确人工字幕、多语言字幕、AI 字幕的能力边界，不宣传全部兼容。
- 已核对官方 README/release：首次安装不预装组件，Release ZIP 不应直接安装。
- 已读取当前官方 userscript 元数据：版本 `2.11.2`、MIT、匹配 `*.bilibili.com`，更新与下载地址均指向项目官方 Raw 文件。
- 已核对官方功能注册表：`downloadSubtitle` 仍在 Stable/Preview 注册；官方文档明确标注 AI 生成字幕不可下载。

## 实机矩阵

| 浏览器/脚本管理器 | 登录状态 | 样本 | 结果 | 记录 |
|---|---|---|---|---|
| Chrome + Tampermonkey | 已登录 | 人工字幕 | 待执行 | 需要干净浏览器配置与 BV 号 |
| Chrome + Tampermonkey | 未登录 | 无字幕 | 待执行 | 需要干净浏览器配置 |
| Edge + Tampermonkey | 已登录 | 人工字幕 | 待执行 | 需要 Edge 干净配置 |
| Chrome + Violentmonkey | 已登录 | 多语言/AI | 待执行 | 需要扩展安装确认 |

## 自动核验结果

| 项目 | 结果 | 证据 |
|---|---|---|
| 官方 userscript 可访问 | 通过 | Raw 文件返回完整 userscript 头与脚本正文 |
| 当前版本 | 通过 | `@version 2.11.2` |
| 安装/更新地址 | 通过 | 均为 `the1812/Bilibili-Evolved` 官方仓库 Raw 地址 |
| 字幕组件存在 | 通过 | 官方功能注册表包含 `downloadSubtitle` |
| AI 字幕 | 不支持 | 官方功能文档明确说明 AI 生成字幕不可下载 |

未将未执行的实机结果写成“通过”。在完成上述矩阵前，条目保持“预期支持/兼容性取决于版本”的措辞。
