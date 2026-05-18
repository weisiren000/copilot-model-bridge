# DeepSeek Provider Adapter Specs

> 日期：2026-05-18  
> 目标：为 OAIProvider 增加 DeepSeek 专用适配规格，解决 DeepSeek V4 thinking mode、tool calls、`reasoning_content` 回放与 OpenAI-compatible 通用实现之间的差异。

## 背景

DeepSeek API 兼容 OpenAI Chat Completions，但并不是“纯 OpenAI 行为”。DeepSeek V4 的 thinking mode 有额外协议要求：

- 官方 OpenAI 格式 base URL：`https://api.deepseek.com`
- OAIProvider 当前会自动拼接 `/chat/completions`，因此 DeepSeek 官方配置推荐使用 `https://api.deepseek.com`
- 当前主模型：`deepseek-v4-flash`、`deepseek-v4-pro`
- 旧模型别名：`deepseek-chat`、`deepseek-reasoner`
- `deepseek-chat` 和 `deepseek-reasoner` 计划在 2026-07-24 后废弃
- V4 thinking 默认启用
- thinking 开关使用：

```json
{
  "thinking": {
    "type": "enabled"
  }
}
```

- 禁用 thinking 使用：

```json
{
  "thinking": {
    "type": "disabled"
  }
}
```

- thinking effort 只支持：

```json
"reasoning_effort": "high"
```

或：

```json
"reasoning_effort": "max"
```

DeepSeek 文档还规定：

- thinking mode 响应中会返回 `reasoning_content`。
- 无 tool call 的普通多轮对话中，`reasoning_content` 可以不回传。
- 有 tool call 的 thinking turn 中，assistant 消息的 `reasoning_content` 必须在后续请求中回传。
- 如果 tool-call 历史缺少必需的 `reasoning_content`，DeepSeek 会返回 HTTP 400。

典型错误：

```text
The reasoning_content in the thinking mode must be passed back to the API.
```

## 参考资料

- DeepSeek Thinking Mode  
  https://api-docs.deepseek.com/guides/thinking_mode
- DeepSeek Tool Calls  
  https://api-docs.deepseek.com/guides/tool_calls
- DeepSeek Reasoning Model  
  https://api-docs.deepseek.com/guides/reasoning_model
- DeepSeek Create Chat Completion  
  https://api-docs.deepseek.com/api/create-chat-completion
- DeepSeek First API Call  
  https://api-docs.deepseek.com/

## Current State

OAIProvider 当前以通用 OpenAI-compatible provider 方式处理所有模型：

- 统一发送 `/chat/completions`
- 统一转换 VS Code messages 到 OpenAI messages
- 统一处理 `tools`
- 统一发送 `reasoning_effort`
- 流式解析只使用：
  - `delta.content`
  - `delta.tool_calls`

当前实现没有处理：

- `delta.reasoning_content`
- assistant tool-call turn 的 reasoning replay
- DeepSeek 专属 `thinking.type`
- DeepSeek effort 取值映射
- DeepSeek legacy model alias 提醒

因此，当 DeepSeek thinking mode 与 tool calls 同时使用时，后续请求可能因为缺失 `reasoning_content` 报 400。

## Relationship To Copilot Parity Roadmap

DeepSeek adapter 不属于通用 Copilot parity 功能，而是 provider 专属协议适配。

与 `docs/specs/copilot-parity-roadmap.md` 的关系：

- DeepSeek Safe Mode Adapter 依赖 Feature 1 的 reasoning 配置能力，但不等待整个 Feature 1 完成。
- DeepSeek tool call 稳定性与 Feature 3 的 Tool Choice Semantics 有交集，但请求参数和 `reasoning_content` replay 必须放在 DeepSeek adapter 内。
- DeepSeek 多模态能力不在本 spec 中展开，继续由 Copilot parity 的 Multimodal Attachment Policy 管理。

优先级建议：DeepSeek Phase 1 应早于大多数 parity 增强，因为它直接修复当前用户可复现的 HTTP 400。

## Goals

1. DeepSeek 直连 API 在 Agent / tool calling 场景下不再因为 `reasoning_content` 缺失报 400。
2. DeepSeek thinking mode 的开关和 effort 参数符合 DeepSeek 官方 API。
3. DeepSeek 专属逻辑与通用 OpenAI-compatible 转换隔离，避免污染其他 provider。
4. 提供短期安全策略和长期完整策略，后续可分阶段实施。

## Non-Goals

- 不展示 DeepSeek chain-of-thought 给用户。
- 不把 `reasoning_content` 当作普通 assistant 文本注入 Copilot UI。
- 不保证所有第三方代理的 DeepSeek 兼容实现都支持官方 `thinking` 参数。
- 不实现 Anthropic 格式 DeepSeek endpoint。
- 不实现 FIM Completion。

## Provider Detection

### Problem

用户可能通过多种方式配置 DeepSeek：

- `baseUrl: "https://api.deepseek.com/v1"`
- `baseUrl: "https://api.deepseek.com"`
- `displayName: "DeepSeek"`
- `model.id: "deepseek-v4-flash"`
- `model.id: "deepseek-v4-pro"`
- `model.id: "deepseek-chat"`
- `model.id: "deepseek-reasoner"`
- 自定义 Yuz endpoint 转发 DeepSeek 模型

只靠 base URL 或 model id 都不稳。

### Proposed Configuration

在 `ProviderConfig` 增加：

```ts
providerType?: 'openai-compatible' | 'deepseek';
```

在 `ModelConfig` 增加：

```ts
providerModelType?: 'generic' | 'deepseek-v4' | 'deepseek-legacy-chat' | 'deepseek-legacy-reasoner';
```

自动推断规则：

- base URL host 包含 `api.deepseek.com` -> `providerType: 'deepseek'`
- model id 以 `deepseek-v4-` 开头 -> `providerModelType: 'deepseek-v4'`
- model id 等于 `deepseek-chat` -> `deepseek-legacy-chat`
- model id 等于 `deepseek-reasoner` -> `deepseek-legacy-reasoner`
- 用户显式配置优先于自动推断

### Acceptance Criteria

- 能识别官方 DeepSeek base URL。
- 能识别 DeepSeek V4 模型 ID。
- 用户可手动标记 Yuz 转发模型为 DeepSeek。
- provider/model 类型判断抽成纯函数并有测试。

## Phase 1: Safe Mode Adapter

### Problem

完整支持 `reasoning_content` replay 需要保存 provider-private state。短期更稳妥的方式是：当 DeepSeek 与 tool calling 同时使用时，默认禁用 thinking，避免进入必须 replay `reasoning_content` 的协议状态。

### Goal

先保证 DeepSeek Agent / tool calling 可用，不再因为 thinking replay 报 400。

### Behavior

当满足以下条件：

- provider/model 被识别为 DeepSeek
- request 中存在 tools
- 当前模型未显式要求 thinking enabled

请求体应包含：

```json
{
  "thinking": {
    "type": "disabled"
  }
}
```

同时不发送无效的低 effort：

- `none` -> thinking disabled，不发送 `reasoning_effort`
- `low` -> thinking enabled 时映射为 `high`
- `medium` -> thinking enabled 时映射为 `high`
- `high` -> `high`
- `xhigh` -> `max`
- `max` -> `max`

### Proposed Configuration

在 `ModelConfig` 增加：

```ts
deepseekThinkingMode?: 'auto' | 'enabled' | 'disabled';
deepseekDisableThinkingWhenTools?: boolean;
```

默认值：

```ts
deepseekThinkingMode: 'auto'
deepseekDisableThinkingWhenTools: true
```

### Request Mapping

#### No tools, effort none

```json
{
  "thinking": {
    "type": "disabled"
  }
}
```

#### No tools, effort high

```json
{
  "thinking": {
    "type": "enabled"
  },
  "reasoning_effort": "high"
}
```

#### Tools present, default safe mode

```json
{
  "thinking": {
    "type": "disabled"
  }
}
```

#### Tools present, user explicitly enables thinking

```json
{
  "thinking": {
    "type": "enabled"
  },
  "reasoning_effort": "high"
}
```

This explicit mode is allowed only after Phase 3 replay support is implemented.

### Acceptance Criteria

- DeepSeek + tools 默认发送 `thinking.type = disabled`。
- DeepSeek + no tools + high/max 发送 `thinking.type = enabled` 和合法 `reasoning_effort`。
- DeepSeek + none 发送 `thinking.type = disabled`。
- `low` / `medium` 映射到 `high`。
- `xhigh` 映射到 `max`。
- 非 DeepSeek provider 不受影响。
- 单元测试覆盖所有映射场景。

## Phase 2: Reasoning Content Capture

### Problem

DeepSeek streaming response 会通过：

```json
{
  "choices": [
    {
      "delta": {
        "reasoning_content": "..."
      }
    }
  ]
}
```

返回 thinking 内容。当前 `OpenAIStreamChunk` 类型和 SSE parser 没有收集这个字段。

### Goal

在不显示给用户的前提下捕获 DeepSeek `reasoning_content`，供后续 replay 使用。

### Proposed Type Change

扩展 `OpenAIStreamChunk`：

```ts
delta: {
  role?: string;
  content?: string;
  reasoning_content?: string;
  tool_calls?: Array<...>;
}
```

### Acceptance Criteria

- SSE parser 能累积 `reasoning_content`。
- `reasoning_content` 不通过 `LanguageModelTextPart` 返回给 VS Code UI。
- 当响应包含 tool calls 时，能将 tool call assistant turn 与 reasoning content 关联。
- 单元测试覆盖：
  - content-only chunk。
  - reasoning-only chunk。
  - mixed reasoning + tool call chunks。

## Phase 3: Tool-Call Reasoning Replay

### Problem

VS Code 的 `LanguageModelChatRequestMessage` 不会保留 provider-private `reasoning_content` 字段。后续请求中，我们需要将 DeepSeek tool-call turn 的 reasoning 内容补回 OpenAI messages。

### Goal

让 DeepSeek thinking + tools 可以完整运行，而不因缺失 `reasoning_content` 报 400。

### Challenge

Provider 需要把上一次响应中的 tool call ID 与 reasoning content 保存起来，并在后续 `convertMessages` 时识别对应 assistant tool-call message。

### Proposed Storage

在 provider 内维护短期内存 cache：

```ts
interface DeepSeekReasoningReplayEntry {
  toolCallIds: string[];
  reasoningContent: string;
  createdAt: number;
}
```

索引：

```ts
Map<string, DeepSeekReasoningReplayEntry>
```

key 建议：

- tool call id 拼接
- 或单个 tool call id 映射到同一 entry

清理策略：

- TTL 30 分钟。
- 最多保存 200 条。
- 每次请求前清理过期 entry。

### Replay Rule

当 `convertMessages` 生成 assistant message 且包含 `tool_calls`：

1. 收集该 assistant message 的 tool call ids。
2. 查 replay cache。
3. 如果找到 reasoning content，则补：

```json
{
  "role": "assistant",
  "content": null,
  "reasoning_content": "...",
  "tool_calls": [...]
}
```

4. 如果 DeepSeek thinking enabled 但找不到 reasoning content：
   - Phase 1 safe mode 下不应发生，因为 tools 会禁用 thinking。
   - 显式 thinking enabled 时应抛出清晰错误，提示用户关闭 thinking 或新开会话。

### Acceptance Criteria

- 有工具调用的 DeepSeek thinking 响应会保存 reasoning content。
- 下一轮请求中的对应 assistant tool-call message 会补回 reasoning content。
- 无工具调用的 thinking 响应不强制 replay。
- replay cache 不泄漏到非 DeepSeek provider。
- 找不到必需 reasoning content 时给出清晰错误。
- 单元测试覆盖：
  - 保存 tool call reasoning。
  - 通过 tool call id replay。
  - 无匹配 id 不 replay。
  - 过期 entry 被清理。

## Phase 4: DeepSeek Model Wizard UX

### Problem

当前添加模型向导只问通用字段，无法表达 DeepSeek 专属配置。

### Goal

让用户可以在 UI 中选择 DeepSeek provider/model 行为，而不是手写 JSON。

### Proposed Wizard Changes

添加 provider 时：

- 如果 base URL 包含 `api.deepseek.com`，提示：

```text
Detected DeepSeek API. Enable DeepSeek adapter?
```

添加模型时：

- 如果 providerType 为 DeepSeek，提供：
  - Thinking mode: Auto / Enabled / Disabled
  - Disable thinking when tools are used: Yes / No
  - Effort levels: High / Max

### Acceptance Criteria

- DeepSeek 官方 base URL 自动提示 adapter。
- DeepSeek 模型默认 `deepseekDisableThinkingWhenTools: true`。
- Wizard 生成的配置不需要用户手写即可安全运行 Agent。
- README 和中文 README 包含 DeepSeek 配置示例。

## Phase 5: Legacy Model Warning

### Problem

DeepSeek 官方说明：

- `deepseek-chat`
- `deepseek-reasoner`

计划在 2026-07-24 后废弃。

### Goal

提醒用户使用新模型：

- `deepseek-v4-flash`
- `deepseek-v4-pro`

### Behavior

当用户添加 legacy model id 时：

- 显示 non-blocking warning。
- 允许继续保存。
- 在 model tooltip 中提示 legacy status。

### Acceptance Criteria

- 添加 `deepseek-chat` 时提示迁移到 `deepseek-v4-flash`。
- 添加 `deepseek-reasoner` 时提示迁移到 `deepseek-v4-flash` + thinking enabled。
- 不阻止用户使用 legacy alias。

## Suggested Implementation Order

1. Provider/model detection pure functions。
2. Phase 1 Safe Mode Adapter。
3. DeepSeek effort mapping。
4. Docs and wizard default configuration。
5. Phase 2 reasoning capture。
6. Phase 3 replay cache。
7. Legacy model warning。

推荐先实现 1-4。这样能最快修复用户遇到的 400，并且风险最小。

## Test Strategy

### Unit Tests

新增测试文件建议：

```text
src/test/deepseek.test.ts
```

覆盖：

- provider detection。
- model detection。
- thinking request mapping。
- effort mapping。
- reasoning chunk accumulation。
- replay cache。

### Integration Smoke Test

手动验证：

1. 配置 DeepSeek V4 Flash。
2. 开启 Agent 模式。
3. 发送需要读文件或修改文件的问题。
4. 确认请求不再 400。
5. 将 thinking mode 显式 enabled 后验证 replay 行为。

### Regression Case

历史错误必须形成回归测试：

```text
DeepSeek thinking mode with tool calls must not send a follow-up request without required reasoning_content.
```

## Documentation Requirements

更新：

- `README.md`
- `docs/README.zh-CN.md`
- provider configuration example

示例配置：

```json
{
  "id": "deepseek",
  "displayName": "DeepSeek",
  "baseUrl": "https://api.deepseek.com/v1",
  "apiKey": "sk-...",
  "providerType": "deepseek",
  "models": [
    {
      "id": "deepseek-v4-flash",
      "name": "DeepSeek V4 Flash",
      "maxInputTokens": 1000000,
      "maxOutputTokens": 65536,
      "supportsToolCalling": true,
      "supportsVision": false,
      "supportsReasoning": true,
      "supportedReasoningLevels": ["high", "max"],
      "defaultReasoningLevel": "high",
      "deepseekThinkingMode": "auto",
      "deepseekDisableThinkingWhenTools": true
    }
  ]
}
```

## Risks

- VS Code provider is mostly stateless; replay cache is best-effort.
- Tool call IDs must remain stable across VS Code message conversion.
- Some DeepSeek-compatible proxies may not implement official `thinking` parameter.
- Exposing reasoning content to UI would be undesirable; it should stay internal.
- Disabling thinking for tools may reduce reasoning quality but improves reliability.

## Open Questions

1. 是否把 `providerType` 放在 provider 级别还是 model 级别？
2. Yuz 转发 DeepSeek 时，base URL 不是 DeepSeek，是否需要手动配置 providerType？
3. Phase 1 是否默认对所有 DeepSeek + tools 禁用 thinking？
4. Phase 3 replay cache 是否需要持久化到 workspace state？
5. 是否允许用户显式开启 DeepSeek thinking + tools，即使 replay 不完整？

建议答案：

- provider 和 model 都支持，model 覆盖 provider。
- Yuz 需要手动配置。
- Phase 1 默认禁用。
- replay cache 先只保存在内存。
- replay 未实现前不允许显式开启 thinking + tools，避免 400。
