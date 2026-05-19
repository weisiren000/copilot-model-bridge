# Copilot Model Bridge Roadmap

> 更新时间：2026-05-20

这个文件只记录当前最重要的两条产品主线。详细实现方案后续再拆到 `docs/specs/`。

## 1. [x] 优化配置 UI（已落地）

目标：把当前偏"字段编辑器"的配置页改成更容易用的向导式体验。

概念 UI 参考：`images/ui-concept-config-manager-v1.html`

已完成：
- 概念稿落地为 VS Code Webview，资源拆分到 `src/webview/`
- 暖米色基底 + 珊瑚红强调色，三栏独立滚动（Provider 列表 / Model 列表 / Inspector）
- Provider 快速配置：仅保留已实际适配的 OpenAI 兼容 + DeepSeek 模板
- Model 以 toggle 开关、推理级别 chips、分类下拉等控件替代手动填写
- 添加模型时支持从 Provider API 拉取列表（`GET /models`）后选择，也支持手动输入
- 删除/复制/添加 Provider 与 Model，带模态确认（沿用 VS Code 原生 showWarningMessage）
- 验证、保存、批量 JSON 导入、健康状态、Toast 反馈

## 2. [x] 适配 DeepSeek（已落地）

目标：解决 DeepSeek thinking mode、tool calling、`reasoning_content` 与
通用 OpenAI-compatible 行为不一致的问题。

已完成：
- [x] 通过 baseUrl 主机名（`api.deepseek.com`）和模型 id 识别 DeepSeek 请求
- [x] 启用 thinking 时正确发送 `thinking: { type: 'enabled' }` 顶层字段
- [x] 把通用 ReasoningLevel 映射到 DeepSeek 合法的 `reasoning_effort`
      （仅 `high` / `max`）
- [x] SSE 流中捕获 `delta.reasoning_content`，以 `application/x-deepseek-reasoning`
      MIME 的 DataPart 形式回报给 VS Code
- [x] 多轮请求中从历史 assistant 消息中提取 reasoning DataPart，按 DeepSeek
      契约还原为 `reasoning_content` 字段；缺失时补空字符串以满足 thinking
      模式的强制要求
- [x] DeepSeek + tools + thinking 三者可同时启用，replay 链路保证不会触发 400
- [x] 配置 UI 中提供 DeepSeek 模板，免去用户手写专属字段
