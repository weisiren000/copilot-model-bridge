# Copilot Model Bridge Roadmap

> 更新时间：2026-05-19

这个文件只记录当前最重要的两条产品主线。详细实现方案后续再拆到 `docs/specs/`。

## 1. [ ] 优化配置 UI

目标：把当前偏“字段编辑器”的配置页改成更容易用的向导式体验。

方向：

- Provider 优先使用模板选择，例如 OpenRouter、Ollama、LM Studio、DeepSeek、Groq。
- Model 优先使用能力预设，例如通用聊天、代码 Agent、Reasoning、Vision、本地小模型。
- 能选的字段尽量改成下拉、开关、多选 chips 或预设按钮，减少手动输入。
- 默认只展示必要字段，高级字段折叠到 Advanced 区域。
- 保留 Raw JSON / Advanced 能力，给高级用户兜底。

## 2. [ ] 适配 DeepSeek

目标：增加 DeepSeek 专用适配，解决 DeepSeek V4 thinking mode、tool calling、`reasoning_content` 与通用 OpenAI-compatible 行为不一致的问题。

方向：

- 识别 DeepSeek provider / model。
- 先实现安全模式：DeepSeek + tools 默认禁用 thinking，避免 `reasoning_content` replay 缺失导致 400。
- 映射 DeepSeek 合法的 thinking / reasoning effort 参数。
- 后续再实现 `reasoning_content` 捕获与 tool-call replay。
- 在配置 UI 中提供 DeepSeek 模板，避免用户手写专属字段。
