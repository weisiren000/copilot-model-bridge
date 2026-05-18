# Copilot Model Bridge Copilot Parity Specs

> 日期：2026-05-18  
> 目标：记录 Copilot Model Bridge 与当前 VS Code / GitHub Copilot 语言模型能力之间的差距，作为后续逐项编写 implementation plan 的规格依据。

## 背景

Copilot Model Bridge 当前已经具备以下基础能力：

- 通过 `LanguageModelChatProvider` 注册 OpenAI 兼容模型。
- 在 Copilot Chat 模型选择器中显示自定义模型。
- 声明 `toolCalling`、`imageInput` 能力。
- 支持 OpenAI-compatible `/chat/completions` SSE 流式响应。
- 支持工具调用的请求和响应转换。
- 支持图片输入转 OpenAI `image_url` 格式。
- 支持 `reasoningEffort` 配置 schema，并兼容 `modelConfiguration` / `modelOptions`。

最新 VS Code / Copilot 侧还在持续增强以下方向：

- 模型选择器中的 per-model configuration。
- Thinking Effort 只对 reasoning 模型显示。
- 模型管理页展示能力、可见性、上下文、计费倍率。
- Agent 模式根据工具能力与编辑工具能力过滤/调度模型。
- 图片、视频等多模态附件输入。
- Auto model selection 与模型类别/默认模型信息。

本规格不直接要求一次性实现所有能力。后续应按章节拆成独立 plan，每个 plan 都要包含测试、最小实现、验证和独立提交。

## 参考资料

- VS Code Language Model Chat Provider API  
  https://code.visualstudio.com/api/extension-guides/ai/language-model-chat-provider
- VS Code Copilot language models / Thinking Effort / model management  
  https://code.visualstudio.com/docs/copilot/customization/language-models
- VS Code proposed `chatProvider` API  
  https://github.com/microsoft/vscode/blob/main/src/vscode-dts/vscode.proposed.chatProvider.d.ts
- VS Code per-model configuration issue  
  https://github.com/microsoft/vscode/issues/302771

## Related Provider-Specific Specs

- DeepSeek Provider Adapter：`docs/specs/deepseek-provider-adapter.md`

DeepSeek 适配是 provider 专属协议差异，不放进通用 parity feature 列表。它应作为独立工作流推进，尤其是 `reasoning_content` replay 和 `thinking.type` 映射，不能污染其他 OpenAI-compatible provider。

## Feature 1: Reasoning Capability Gating

> 状态：已完成（2026-05-18）

### Problem

当前 Copilot Model Bridge 会给所有模型挂载 `configurationSchema`，因此所有模型都可能显示 Thinking Effort 子菜单。

官方行为是：只有 reasoning 模型显示 Thinking Effort。非 reasoning 模型，例如 GPT-4.1、GPT-4o，不显示该菜单。

### Goal

让 Thinking Effort 成为模型能力驱动的可选配置，而不是所有模型默认启用。

### Proposed Configuration

在 `ModelConfig` 增加：

```ts
supportsReasoning?: boolean;
supportedReasoningLevels?: ReasoningLevel[];
defaultReasoningLevel?: ReasoningLevel;
```

配置含义：

- `supportsReasoning`: 是否在模型选择器显示 Thinking Effort。
- `supportedReasoningLevels`: 该模型可选的 effort 列表。
- `defaultReasoningLevel`: 默认 effort。

默认行为：

- 旧配置没有 `supportsReasoning` 时，应保持向后兼容。
- 推荐默认值为 `false`，但现有已配置 `defaultReasoningLevel` 的模型可迁移为 `supportsReasoning: true`。

### Acceptance Criteria

- 非 reasoning 模型不返回 `configurationSchema`。
- reasoning 模型返回 `configurationSchema.properties.reasoningEffort`。
- `reasoningEffort` 使用官方字段名。
- `group` 为 `navigation`，使配置出现在模型选择器主操作区。
- 请求时优先读取 `modelConfiguration.reasoningEffort`。
- 兼容旧入口：`modelOptions.reasoningEffort`、`modelOptions.reasoningLevel`、`modelOptions.reasoning_effort`。
- 单元测试覆盖：
  - 非 reasoning 模型没有 schema。
  - reasoning 模型有 schema。
  - `modelConfiguration` 优先于 `modelOptions`。
  - unsupported effort 回退到模型默认值。

### Suggested Plan Split

1. 类型与配置读取。
2. schema 生成逻辑。
3. 命令行添加模型向导。
4. 文档与迁移说明。

## Feature 2: Edit Tools Capability Hints

> 状态：已完成（2026-05-18）

### Problem

VS Code proposed API 支持 `capabilities.editTools`，用于提示模型适合哪些编辑工具。当前 Copilot Model Bridge 只声明：

```ts
capabilities: {
  toolCalling,
  imageInput,
}
```

缺少编辑工具 hint，可能导致 Agent 在代码编辑任务中无法获得和原生模型接近的工具选择体验。

### Goal

为支持代码编辑的模型提供 `editTools` 能力声明。

### Proposed Configuration

在 `ModelConfig` 增加：

```ts
supportsEditTools?: boolean;
preferredEditTools?: Array<'find-replace' | 'multi-find-replace' | 'apply-patch' | 'code-rewrite'>;
```

默认行为：

- `supportsEditTools` 默认跟随 `supportsToolCalling`。
- 如果 `supportsEditTools` 为 `true` 且未配置 `preferredEditTools`，默认：

```ts
['find-replace', 'multi-find-replace', 'apply-patch']
```

### Acceptance Criteria

- 支持编辑工具的模型 metadata 中包含 `capabilities.editTools`。
- 不支持工具调用的模型不声明 `editTools`。
- 配置中的未知 edit tool 被过滤，不进入 metadata。
- 单元测试覆盖：
  - 默认 edit tools。
  - 自定义 edit tools。
  - 未知值过滤。
  - `supportsToolCalling: false` 时不声明 edit tools。

### Suggested Plan Split

1. 类型与配置 schema。
2. provider metadata 映射。
3. 添加模型向导中的编辑工具选项。
4. README / 中文文档同步。

## Feature 3: Model Billing Multiplier Metadata

> 状态：已完成（2026-05-18）

### Problem

Copilot 模型选择器和模型管理页会展示 premium request multiplier / billing details。Copilot Model Bridge 目前不声明 `multiplier` 或 `multiplierNumeric`，因此自定义模型缺少费用/倍率提示。

BYOK 模型不一定使用 GitHub premium request 计费，但提供倍率字段可以让用户给模型增加成本提示。

### Goal

支持在模型 metadata 中声明计费倍率或成本标签。

### Proposed Configuration

在 `ModelConfig` 增加：

```ts
multiplier?: string;
multiplierNumeric?: number;
```

默认行为：

- BYOK 模型默认 `0x`。
- 用户可将高成本模型配置为 `1x`、`2x`、`High` 等标签。
- 如果 `multiplierNumeric` 未配置，但 `multiplier` 是 `<number>x` 格式，可自动推导数值。

### Acceptance Criteria

- 模型 metadata 带上 `multiplier`。
- 可解析时带上 `multiplierNumeric`。
- 模型列表 hover / 管理页能看到倍率信息。
- 配置非法时不阻塞模型注册，只忽略数值字段。
- 单元测试覆盖：
  - 默认 `0x`。
  - `1x` 推导为 `1`。
  - `0.5x` 推导为 `0.5`。
  - 非数字标签只保留 `multiplier`。

### Suggested Plan Split

1. 类型与解析函数。
2. provider metadata 映射。
3. 添加模型向导支持倍率。
4. 文档更新。

## Feature 4: Multimodal Attachment Policy

> 状态：已完成（2026-05-18）

### Problem

Copilot 最新支持图片和视频附件。Copilot Model Bridge 当前只处理 `image/*` 的 `LanguageModelDataPart`，其他 MIME 类型会被忽略。

静默忽略附件会导致用户误以为模型收到了文件或视频，实际请求中没有。

### Goal

明确处理多模态附件策略：

- 图片：继续转 OpenAI `image_url`。
- 视频：先显式拒绝或降级为清晰错误。
- 文本 data part：转成文本。
- JSON data part：转成文本或工具结果内容。
- 未知二进制：显式拒绝。

### Proposed Configuration

在 `ModelConfig` 增加：

```ts
supportsVideo?: boolean;
supportsFileInput?: boolean;
```

默认行为：

- `supportsVideo: false`
- `supportsFileInput: false`

### Acceptance Criteria

- `image/*` 继续进入 OpenAI-compatible 请求体。
- `video/*` 在模型不支持时抛出明确错误。
- `text/*` 能进入请求体文本内容。
- `application/json` 能序列化为文本内容。
- 未知 MIME 类型不静默丢弃。
- 单元测试覆盖：
  - 图片转换。
  - 视频拒绝。
  - 文本 data part 转换。
  - JSON data part 转换。
  - 未知 MIME 类型错误信息。

### Suggested Plan Split

1. MIME 分类与 OpenAI content 转换。
2. provider 中调用转换结果和错误处理。
3. 模型配置字段。
4. 文档说明支持边界。

## Feature 5: Tool Choice Semantics

### Problem

当前实现中，如果 `options.toolMode === Required`，请求体设置：

```ts
tool_choice = 'auto'
```

这与 Required 的语义不完全一致。OpenAI-compatible 后端对 `tool_choice` 支持差异较大，直接映射容易出现“必须工具调用”不生效或后端报错。

### Goal

将 VS Code `LanguageModelChatToolMode` 映射成可配置的 OpenAI-compatible tool choice 策略。

### Proposed Configuration

在 provider 或 model 上增加：

```ts
toolChoiceMode?: 'auto' | 'required' | 'none' | 'omit';
```

默认行为：

- 有工具且 Auto：`tool_choice: 'auto'`
- 有工具且 Required：
  - 如果后端支持 required：`tool_choice: 'required'`
  - 否则：`tool_choice: 'auto'`
- 无工具：不发送 `tools` / `tool_choice`

### Acceptance Criteria

- tool choice 映射逻辑独立成纯函数。
- Auto / Required / 无工具都有测试。
- 不支持 required 的模型可回退 auto。
- 后端不支持 `tool_choice` 时可配置为 `omit`。

### Suggested Plan Split

1. 纯函数与测试。
2. 类型和配置。
3. provider 请求体接入。
4. 文档说明兼容策略。

## Feature 6: Token Counting Improvements

### Problem

当前 `provideTokenCount` 使用字符数除以 4 的粗估方法，且只统计文本。图片、工具调用、结构化内容不会被合理计入。

这会影响上下文预算、模型选择器显示和长对话稳定性。

### Goal

提升 token count 的稳定性和可解释性。

### Proposed Behavior

短期：

- 文本：继续粗估。
- 图片：按固定成本估算，例如每张图 1024 tokens。
- 工具结果：按文本序列化估算。
- JSON/data part：按序列化文本估算。

中期：

- 允许 provider/model 配置 `tokenEstimator` 策略。
- 对 OpenAI 模型可接入 tokenizer 库。

### Acceptance Criteria

- `provideTokenCount` 不再忽略图片和工具结果。
- 估算逻辑抽成纯函数。
- 单元测试覆盖文本、图片、工具结果、混合消息。
- 文档明确 token count 是估算，不保证与后端完全一致。

### Suggested Plan Split

1. 抽出 token estimator。
2. 覆盖 VS Code message part 类型。
3. provider 接入。
4. 文档更新。

## Feature 7: Model Metadata Polish

### Problem

Copilot Model Bridge 当前 metadata 基本可用，但和 Copilot 原生模型相比，hover 和管理页信息还不够完整。

### Goal

让模型在 picker / Manage Models 中更像原生模型：

- 更清晰的 `family`。
- 更准确的 `version`。
- 更短的 `detail`。
- 更信息密度高的 `tooltip`。
- 可选 `category`。
- 可选 `statusIcon`。

### Proposed Configuration

在 `ModelConfig` 增加：

```ts
family?: string;
version?: string;
categoryLabel?: string;
categoryOrder?: number;
statusIcon?: string;
```

默认行为：

- `family` 默认从 model id 前缀推导。
- `version` 默认空字符串或 `1.0.0`，保持当前兼容。
- `category` 默认不声明，让 VS Code 按 provider 分组。

### Acceptance Criteria

- hover 中不暴露过长 base URL 时仍可找到 provider/model id。
- category 可配置但默认不影响当前显示。
- status icon 仅允许安全的 VS Code ThemeIcon id。
- 单元测试覆盖 metadata builder。

### Suggested Plan Split

1. 抽出 model metadata builder。
2. 类型与配置。
3. provider 接入。
4. 文档更新。

## Feature 8: Provider Management UX

### Problem

当前管理命令能添加 provider/model，但更新已有 provider、编辑模型、批量导入、能力复核不够方便。

### Goal

增强 provider 管理体验，让用户能无需手写 JSON 完成常见维护。

### Proposed Commands

新增或增强：

- `Copilot Model Bridge: Edit Provider`
- `Copilot Model Bridge: Edit Model`
- `Copilot Model Bridge: Duplicate Model`
- `Copilot Model Bridge: Validate Provider Config`
- `Copilot Model Bridge: Import Models from JSON`

### Acceptance Criteria

- 所有命令不破坏现有配置。
- 编辑模型时保留未知字段，避免覆盖用户手写扩展配置。
- validate 命令能发现：
  - 重复 model id。
  - base URL 非法。
  - reasoning 配置不一致。
  - vision 标记与模型附件策略冲突。
- 单元测试覆盖配置更新函数。

### Suggested Plan Split

1. 配置更新 helper。
2. Edit Model 命令。
3. Validate 命令。
4. Import 命令。

## Recommended Implementation Order

1. Reasoning Capability Gating
2. Edit Tools Capability Hints
3. Tool Choice Semantics
4. Multimodal Attachment Policy
5. Model Billing Multiplier Metadata
6. Token Counting Improvements
7. Model Metadata Polish
8. Provider Management UX

理由：

- 1 和 2 最贴近 Copilot 当前模型选择器和 Agent 编码体验。
- 3 能降低工具调用不稳定风险。
- 4 解决用户可感知的附件丢失问题。
- 5、6、7 提升管理页和长对话体验。
- 8 是 UX 增强，可最后做。

## Non-Goals

- 不实现 Copilot Auto model selection。自定义 provider 无法直接获得 GitHub Copilot 的动态路由能力。
- 不实现 inline suggestion model provider。当前扩展目标只覆盖 Chat / Agent。
- 不保证所有 OpenAI-compatible 后端支持完全一致的工具、视频、reasoning 参数。
- 不把 CHANGELOG 子仓库内容并入当前仓库。

## Plan Template For Each Feature

后续为每个 feature 单独写 implementation plan 时，应至少包含：

- 目标行为。
- 影响文件。
- 新增/修改类型。
- 失败测试。
- 最小实现。
- 编译与针对性测试命令。
- VSIX 打包验证。
- 是否需要更新 README / 中文 README。
- 独立 commit message。

推荐每个 feature 一次独立提交；如果 feature 较大，则按“类型/纯函数/Provider 接入/文档”拆成多次提交。

