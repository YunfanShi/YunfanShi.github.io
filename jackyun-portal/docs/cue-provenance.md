# CUE 来源与真题标注（3.79.0）

CUE 管理的单条编辑器、批量 JSON、交换 JSON 均支持以下可选字段。旧 CUE 省略这些字段，继续正常学习。

| 字段 | 含义 | 示例 |
| --- | --- | --- |
| sourceKind | 来源类型，可写具体平台 | ChatGPT / book / teacher / website |
| source | 具体书名及版本、讲义或对话名称 | Cambridge Physics · 3rd edition |
| sourceLocation | 页码、章节、题号或对话定位 | Chapter 3 · P42 · Q5 |
| sourceUrl | 完整 http/https 原始链接 | 真实教材链接或对话分享链接 |
| examStatus | 真题考查情况 | unknown / tested / not-tested |
| examHistory | 考试依据或核对范围 | CAIE 9702 · 2025 May/June · Paper 22 · Q3(b) |

`unknown` 为未标注，`tested` 为考过，`not-tested` 为尚未考过。考试字段由使用者填写，不根据学习评价自动推断；AI 提示词也要求没有可靠依据时省略或填 unknown。来源名称最多 1000 字符、定位 300、链接 2000、考试依据 1000。更新时省略字段保留原值，空字符串清空可选文本。

批量更新示例（替换 ID 和来源信息后导入）：

```json
{
  "version": 1,
  "operations": [
    {
      "action": "update",
      "id": "现有 CUE ID",
      "sourceKind": "ChatGPT",
      "source": "力与动量讨论",
      "sourceLocation": "2026-11-11 对话 · 第 8 条回答",
      "examStatus": "unknown",
      "examHistory": ""
    }
  ]
}
```

管理页的“复制全部科目 CUE JSON”与现有下载入口使用同一个 `jackyun-cue-exchange` 格式，不受当前学科或状态筛选影响。分析后的文件可通过“导入 CUE 并逐条对比”导回；采用外部内容会保留本地学习历史，只更新卡片内容与来源、考查标注。批量 operations JSON 仍使用原有每批 200 项限制；交换文件沿用每文件 2000 张限制。

# 保存与重练回归

- 第一次判定保存评价并停留；第二次点击相同判定或主动前进才进入已到期的重练。
- 手动完成保存期间不提交旧 React 渲染的自动保存；完成记录使用会话 ID，延迟进度事件不能复活已完成会话。
- 保存按钮显示进行中状态，保存失败显示可重试错误；本机持久化完成后才关闭学习界面。
- 游戏侧栏可折叠并保留本机偏好；3.80 起隐藏侧栏保留星空主题，关闭背景动画时保留静态效果。收藏册按需分组，游戏面板避免随每秒计时重复渲染。

验证：`npm run test:learning`；同步相关测试见 `tests/sync-performance.test.mts`、`tests/sync-engine.test.mts`。本地启动服务后运行 `JACKYUN_TEST_URL=http://localhost:3239 node tests/cue-save-performance.browser.mts`，覆盖桌面与触屏、按题数与按时间重练、保存后刷新、来源及跨科目复制。测试使用隔离的游客 IndexedDB 数据，不访问真实账号。

## 本次验证记录

- 学习域回归：198 / 198 通过。
- CUE/V5 定向回归：68 / 68 通过，含 380 张 CUE、1170 条历史记录的跨设备恢复用例、同步合并及序列化检查。
- 浏览器：1440px 桌面按题数重练与 820px 触屏按时间重练通过；验证了首次判定不跳转、二次确认进入、保存后立即刷新、草稿不复活、侧栏隐藏/展开、全科复制及来源/考试标注修改导回。
- 修改文件 ESLint、TypeScript、私钥扫描与生产构建通过（使用游客测试配置）。
- 全量 `verify` 未全绿：未改动的 IELTS 测试桩失效（以原始远程 merge 复核仍失败）；部分同步测试在当前 Node 26 环境的 Storage.length 测试桩处失败，workspace-sync-recovery 挂起后终止；Companion Preview ZIP 的 README 与源文件不一致。Azure 子项目初次缺少 pg，安装其锁定依赖后，相关 Azure/CUE 定向测试通过。
- 上述无关失败未通过跳过断言或修改学习数据来掩盖；本次未验证真实账号的在线跨设备同步。
