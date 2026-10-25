# 全站错误码

非模态提示显示在页面标题栏下方，层级低于菜单和对话框；提示卡片的说明区域不拦截页面点击，复制和关闭按钮保持可用。提示按说明文字、错误码、复制日志按钮的顺序展示。手动关闭后，同一错误码及其别名在 30 分钟内不再弹窗，跨页面、刷新和同源标签页生效；不同错误码仍显示。自动隐藏不触发静默，静默期间重复错误不延长截止时间。关闭后不删除诊断日志，console 与诊断日志继续正常记录。弹窗不抢输入焦点，同时只显示一条紧凑提示，错误码和复制操作在详情中展开；同一错误码和来源在提示显示期间合并计数。每条提示首次出现后 8 秒自动隐藏，重复报错不延长该条显示时间。仅页面可见且窗口拥有焦点时弹出；切到后台立即清除提示，后台错误只记录日志，回到前台不补弹。主动取消请求不弹错误提示。

## 编号与服务端错误

JY-1xxx 账号；2xxx 网络、服务与同步；3xxx 输入、内容和存储；4xxx 页面运行；5xxx AI；6xxx 外部集成；9xxx 兜底。后端原始 code 和 requestId 保存在可复制诊断中；HTTP 错误、普通字符串错误和没有显式 code 的模块错误都有文档化的兜底编号。

| 错误码 | 类别 | 显示说明 | 处理方式 | 已知后台或模块别名 |
| --- | --- | --- | --- | --- |
| JY-1001 | 账号 | 登录状态已失效，请重新登录后重试。 | 重新登录 | UNAUTHORIZED, AUTH_REQUIRED, SESSION_EXPIRED |
| JY-1002 | 账号 | 你暂时没有权限执行此操作。 | 检查账号权限或联系管理员 | FORBIDDEN, DEVICE_REVOKED, ACCOUNT_SUSPENDED, ACCOUNT_DELETED |
| JY-1003 | 账号 | 登录服务暂时不可用，请稍后重试。 | 稍后重试 | AUTH_UNAVAILABLE, AUTH_SERVICE_UNAVAILABLE |
| JY-2001 | 网络 | 网络连接失败，请检查网络后重试。 | 检查网络连接 | NETWORK_ERROR, FETCH_FAILED |
| JY-2002 | 网络 | 请求等待超时，请重试。 | 重试；本机未提交的修改会保留 | TIMEOUT, REQUEST_TIMEOUT |
| JY-2003 | 网络 | 请求过于频繁，请稍后再试。 | 等待后重试 | RATE_LIMITED, RATE_LIMIT_EXCEEDED |
| JY-2004 | 服务 | 服务暂时不可用，请稍后重试。 | 稍后重试或查看服务状态 | SERVICE_UNAVAILABLE, BACKEND_UNAVAILABLE |
| JY-2005 | 服务 | 请求没有完成，请稍后重试。 | 重试并保留错误日志 | REQUEST_FAILED, INTERNAL_ERROR, INTERNAL_SERVER_ERROR |
| JY-2101 | 同步 | 同步服务暂时不可用，本机修改已保留。 | 稍后同步；不要清除本机数据 | SYNC_UNAVAILABLE, SYNC_CONFIGURATION_ERROR, SYNC_REMOTE_UNAVAILABLE |
| JY-2102 | 同步 | 本次修改尚未被云端确认，待同步数据已保留。 | 重试同步 | SYNC_WRITE_FAILED, UPLOAD_WRITE_FAILED, UPLOAD_READ_FAILED, UPLOAD_RESET_FAILED |
| JY-2103 | 同步 | 云端内容已经变化，系统将重新核对版本。 | 等待自动重新合并；真实冲突到同步中心处理 | REVISION_CHANGED, RESTORE_VERSION_CHANGED, SYNC_BASE_MISSING, SYNC_CONFLICT |
| JY-2104 | 同步 | 同步数据未通过完整性校验，原始内容已保留。 | 重试同步并复制日志 | INVALID_DELTA, INVALID_PART, UPLOAD_INCOMPLETE, OPERATION_ID_REUSED, SYNC_INTEGRITY_FAILED |
| JY-2105 | 同步 | 请刷新旧页面后再同步，本机修改已保留。 | 刷新所有设备上的旧页面 | SYNC_UPGRADE_REQUIRED |
| JY-2106 | 同步 | 云端版本发生回退，本机内容和同步基准已保留。 | 联系管理员核对云端版本 | SYNC_VERSION_ROLLBACK |
| JY-3001 | 输入 | 提交的数据不符合要求，请检查输入。 | 检查必填项和数据格式 | INVALID_BODY, INVALID_OPERATIONS, INVALID_KEY, INVALID_CURSOR, VALIDATION_ERROR, BAD_REQUEST |
| JY-3002 | 输入 | 数据超过本次操作允许的大小。 | 缩小文件或分批处理 | PAYLOAD_TOO_LARGE, EXPORT_SCAN_LIMIT, MANIFEST_SCAN_LIMIT |
| JY-3003 | 内容 | 所需内容不存在或已被移除。 | 刷新列表或核对链接 | NOT_FOUND, RECORD_NOT_FOUND |
| JY-3101 | 存储 | 本机数据暂时无法保存，请检查浏览器存储空间。 | 释放空间；不要清除尚未同步的数据 | QUOTA_EXCEEDED, STORAGE_FAILED |
| JY-4001 | 页面 | 页面加载失败，请重试或刷新页面。 | 刷新页面并复制日志 | RENDER_FAILED, PAGE_RENDER_FAILED |
| JY-4002 | 页面 | 页面资源加载失败，请检查网络并刷新。 | 刷新页面 | RESOURCE_LOAD_FAILED, CHUNK_LOAD_FAILED |
| JY-4003 | 运行 | 运行此功能时出现了错误，请重试。 | 重试并复制日志 | CLIENT_RUNTIME_ERROR |
| JY-5001 | AI | AI 返回的内容暂时无法解析，请重试。 | 重试请求 | AI_PARSE_FAILED |
| JY-5002 | AI | AI 请求没有完成，请稍后重试。 | 重试或检查 AI 服务配置 | AI_REQUEST_FAILED |
| JY-6001 | 集成 | 外部服务操作未完成，请检查连接后重试。 | 检查外部服务授权与连接 | INTEGRATION_FAILED |
| JY-9001 | 其他 | 操作未完成，请重试；持续出现时请复制日志反馈。 | 复制日志并反馈 | 通用兜底 |

## 捕获范围

覆盖 fetch、XMLHttpRequest、console.error、未捕获异常、Promise 拒绝、资源加载失败、React 页面边界和 jackyun:diagnostic 模块事件。旧 HTML 页面通过共享脚本获得同一错误提示；嵌入页面仅向同源、可识别的父窗口转发，独立页面自行显示。服务端错误必须通过响应或页面边界送达客户端；尚未送达浏览器的后台日志不会凭空显示。

## 复制日志

包含当前错误码、原始 API 错误码、请求编号、HTTP 状态、时间、路径、重复次数及最近诊断。复制前再次删除口令、令牌、Cookie、API Key 和 URL 查询参数。剪贴板不可用时提供可选中文本，方便手动复制；不会向任何服务器自动发送日志。

## 开发方式

通过共享 apiError 返回稳定 code；模块用 emitDiagnostic('error', tag, message, data)，显式编号可放在 data.code。可调用 window.JackyunErrors.report({code, message, requestId})。显示文字采用错误码表中的用户说明，技术消息保留于日志。目录源文件 src/lib/error-codes.ts，运行脚本 scripts/error-notices-runtime.js，生成物 public/shared/error-notices.js。改动后执行 node scripts/build-error-system.mjs；CI 用 --check 验证生成物与文档一致。
