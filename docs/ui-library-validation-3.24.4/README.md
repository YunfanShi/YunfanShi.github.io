# 组件库更换计划与可行性报告 3.24.4

按用户最新范围，仅交付计划与可行性，不实施迁移或兼容性样板。

建议使用 shadcn/ui 组件源码配合 Radix，保留 Next.js、React 与现有 Tailwind 3，分批统一交互。

报告共七页，包含选型比较、兼容前提、迁移顺序、投入估算、使用体验目标、风险、验收与回退方案。第一批估算 7 至 12 工作日，主要 React 界面估算 15 至 25 工作日；旧 HTML 另估，详见报告中的假设与范围。

## 验证与限制

- 已核对远程 main 与本机基线提交均为 7a68ddd；工作区其他改动保留。
- 已审阅本机依赖、主题、Tailwind 配置、工具标签页及导航和旧页面实现；核对 shadcn、Radix、Ant Design、MUI、Next.js 官方文档。
- 未完成依赖安装兼容性验证、生产构建、业务回归或设备性能测试；计划不代表这些检查已通过。
- DOCX ZIP 和 XML 结构检查通过，含六个显式分页、五张对比表。
- 标准 render_docx.py 缺少 LibreOffice soffice.exe，使用 docx-preview 与 Edge 后备预览；七页均逐页检查，无溢出。未进行 Word 或 LibreOffice 渲染验证。
- 本次只更新版本字段至 3.24.4 并提交文档，不改变生产业务代码或生产依赖。

## 重新生成

使用配置了 python-docx 的 Python 执行 create-report.py。render-report.cjs 为本机检查辅助脚本，依赖本地 Playwright 和 docx-preview，可按实际路径调整。qa 目录和 metadata.patch 仅用于本机检查与精确暂存，不提交。
