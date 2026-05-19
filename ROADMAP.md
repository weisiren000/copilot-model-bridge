# Copilot Model Bridge Roadmap

> 更新时间：2026-05-19

这个文件只记录当前最重要的两条产品主线。详细实现方案后续再拆到 `docs/specs/`。

## 1. [~] 优化配置 UI（概念稿已完成，待落地）

目标：把当前偏"字段编辑器"的配置页改成更容易用的向导式体验。

概念 UI 参考：`images/ui-concept-config-manager-v1.html`

已完成：
- 新 Logo 已抠图就位（`images/logo.png`），待正式命名后替换
- Provider 快速配置：OpenAI 兼容、OpenAI Response、DeepSeek 等模板下拉选择
- Model 以预设能力 toggle 开关替代手动填写
- 能力相关字段使用下拉、开关、多选 chips 减少手动输入
- 支持的推理级别改为 chip 标签选择
- 分类标签改为下拉选择
- 模型 ID 支持从 Provider API 拉取列表后选择，也支持手动输入
- 卡片选中效果统一、按钮/select hover 样式统一
- Provider/Model 列表卡片交互

下一步：将概念 HTML 落地为 VS Code 扩展 Webview 实现，需兼容概念稿中的交互功能：

- Provider 预设模板下拉选择并自动填充表单（OpenAI 兼容 / Response / DeepSeek 等）
- 添加模型时支持从 Provider API 拉取模型列表供选择，也支持手动输入
- 推理级别 chip 标签多选，默认级别与支持级别联动
- 能力 toggle 开关、分类标签下拉等字段交互
- Provider/Model 卡片选中、删除、复制等操作
- 卡片选中效果、按钮/select hover 等样式统一

## 2. [ ] 适配 DeepSeek

目标：增加 DeepSeek 专用适配，解决 DeepSeek V4 thinking mode、tool calling、`reasoning_content` 与通用 OpenAI-compatible 行为不一致的问题。

方向：

- 识别 DeepSeek provider / model。
- 先实现安全模式：DeepSeek + tools 默认禁用 thinking，避免 `reasoning_content` replay 缺失导致 400。
- 映射 DeepSeek 合法的 thinking / reasoning effort 参数。
- 后续再实现 `reasoning_content` 捕获与 tool-call replay。
- 在配置 UI 中提供 DeepSeek 模板，避免用户手写专属字段。
