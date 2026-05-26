# OpenAI Responses API 适配设计

> 日期：2026-05-24
> 状态：设计中

## 一、背景

当前项目只支持 OpenAI Chat Completions API（`POST /v1/chat/completions`），需要新增对 OpenAI Responses API（`POST /v1/responses`）的支持。

两个 API 的核心差异：

| 维度 | Chat Completions | Responses API |
|------|-----------------|---------------|
| 端点 | `/chat/completions` | `/responses` |
| 消息字段 | `messages` | `input` |
| 系统提示 | `role: "system"` | `instructions` 顶层字段或 `input` 中的 `system`/`developer` message |
| 最大 token | `max_tokens` | `max_output_tokens` |
| SSE 流 | `data: {"choices":[{"delta":...}]}` | 语义化事件：`event: response.output_text.delta` 等 |
| 工具调用流 | `delta.tool_calls[]` 增量 | `response.function_call_arguments.delta` / `.done` |
| 工具历史 | `assistant.tool_calls[]` + `role: "tool"` | `function_call` + `function_call_output` input item |

## 二、设计决策

| 决策 | 结论 |
|------|------|
| apiStyle 粒度 | Provider 级别，统一使用一种 API 风格 |
| 系统提示传递 | 优先使用 `instructions` 顶层字段；若未来 VS Code 暴露多条 system/developer message，再保留为 `input` message |
| 第三方兼容 | 不做白名单限制，调不通由用户自行负责 |
| Responses 默认值 | 默认 `apiStyle: 'chat'`，不做 breaking change |
| 工具兼容优先级 | 本期只适配 VS Code 插件工具/function calling，不接入 OpenAI 内置工具 |

## 三、目标目录结构

```
openaiCompatible/
├── index.ts
├── cmb.openaiCompatible.httpClient.ts          ← 重命名自 chatHttpClient.ts，URL 参数化
├── cmb.openaiCompatible.content.ts             ← 不动
├── cmb.openaiCompatible.requestHeaders.ts      ← 不动
├── cmb.openaiCompatible.reasoning.ts           ← 不动
├── cmb.openaiCompatible.billing.ts             ← 不动
├── cmb.openaiCompatible.capabilities.ts        ← 不动
├── cmb.openaiCompatible.token.ts               ← 不动
├── cmb.openaiCompatible.modelsCatalog.ts       ← 不动
│
├── chatCompletions/                            ← Chat API 专属
│   ├── cmb.chatCompletions.messages.ts         ← 迁入（原 messages.ts）
│   ├── cmb.chatCompletions.tools.ts            ← 新增，Chat tools/tool_choice 组装
│   ├── cmb.chatCompletions.request.ts          ← 新增，请求体构建逻辑
│   └── cmb.chatCompletions.stream.ts           ← 迁入（原 stream.ts）
│
└── responses/                                  ← Responses API 专属
    ├── cmb.responses.input.ts                  ← 新增，Responses input item 转换
    ├── cmb.responses.tools.ts                  ← 新增，Responses tools/tool_choice 组装
    ├── cmb.responses.request.ts                ← 新增，responses 格式请求体
    └── cmb.responses.stream.ts                 ← 新增，语义化 SSE 事件解析
```

## 四、数据流与调度

```
sendChatRequest()                         ← cmb.provider.request.ts
  │
  ├─ resolveApiStyle(provider) → 'chat' | 'responses'
  │
  ├─ 'chat' ──────────────────────────────────────────────
  │   convertMessages()           → chatCompletions/
  │   buildChatRequestBody()      → chatCompletions/
  │   postStreaming(url, ...)     → httpClient
  │   consumeChatSSEStream()      → chatCompletions/
  │
  └─ 'responses' ────────────────────────────────────────
      convertMessages()           → chatCompletions/ (复用 VS Code 到 Chat 中间格式)
      convertToResponsesInput()   → responses/ (显式转换为 Responses input item)
      buildResponsesRequestBody() → responses/
      postStreaming(url, ...)     → httpClient
      consumeResponsesSSEStream() → responses/
```

通用中间格式由 `chatCompletions/messages.ts` 的 `convertMessages()` 输出。这个中间格式仍是 Chat Completions 形态，只能作为桥接输入，不能原样发送到 Responses API。Responses 适配层必须把每一种消息显式转换为 Responses input item。

## 五、各模块详设

### 5.1 `cmb.openaiCompatible.httpClient.ts`

```typescript
// 签名：只管 POST 流式请求，URL 由调用方拼接
export function postStreaming(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal
): Promise<Response>
```

原 `postStreamingChatCompletion` 重命名为 `postStreaming`，不再硬编码路径。

### 5.2 `cmb.chatCompletions.tools.ts`（新增）

从 `cmb.provider.request.ts` 中抽取 Chat 工具参数组装逻辑：

```typescript
export function buildChatTools(
  options: vscode.ProvideLanguageModelChatResponseOptions,
  toolChoiceMode: ToolChoiceMode | undefined
): { tools?: unknown[]; tool_choice?: unknown }
```

处理规则：
- `options.tools` 映射为 Chat Completions 的 `{ type: 'function', function: { name, description, parameters } }`
- `resolveToolChoice()` 仍复用现有策略
- `toolChoiceMode: 'omit'` 不发送 `tool_choice`
- `toolChoiceMode: 'none'` 发送 `tool_choice: 'none'`
- `toolChoiceMode: 'required'` 仅在 VS Code 请求 Required 时发送 `required`

### 5.3 `cmb.chatCompletions.request.ts`（新增）

从 `cmb.provider.request.ts` 中抽取 Chat 请求体构建逻辑：

```typescript
export function buildChatRequestBody(modelId, messages, options): Record<string, unknown>
```

包含 `max_tokens`、`reasoning_effort`、`tools`、`tool_choice` 等字段组装。

### 5.4 `cmb.responses.input.ts`（新增）

```typescript
// 输入：Chat Completions 形态的中间消息数组
// 输出：Responses API input items
export function convertToResponsesInput(
  messages: ChatCompletionMessage[]
): { instructions?: string; input: ResponsesInputItem[] }
```

处理逻辑：
1. `role === 'system'` 且内容为文本时提取到 `instructions`；多条 system 用换行拼接，非文本 system 保留为 `input` message。
2. `role === 'user'` 映射为 `{ type: 'message', role: 'user', content: [...] }`。
3. `role === 'assistant'` 且有文本内容时映射为 `{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }`。
4. `assistant.tool_calls[]` 必须拆成独立 `{ type: 'function_call', call_id, name, arguments }` input item。
5. `role === 'tool'` 必须映射为 `{ type: 'function_call_output', call_id, output }`，不能把 `tool_call_id` 原样发送。
6. Chat content part 类型必须转换：`{ type: 'text' }` → `{ type: 'input_text' }`，`{ type: 'image_url' }` → `{ type: 'input_image' }`。
7. 当前 DeepSeek 专用 `__reasoningContent` 不发送到 Responses；OpenAI Responses 的 reasoning item/encrypted content 作为后续能力单独设计。

示例：

```json
[
  {
    "type": "function_call",
    "call_id": "call-1",
    "name": "read_file",
    "arguments": "{\"path\":\"README.md\"}"
  },
  {
    "type": "function_call_output",
    "call_id": "call-1",
    "output": "file contents"
  }
]
```

### 5.5 `cmb.responses.tools.ts`（新增）

```typescript
export function buildResponsesTools(
  options: vscode.ProvideLanguageModelChatResponseOptions,
  toolChoiceMode: ToolChoiceMode | undefined
): { tools?: unknown[]; tool_choice?: unknown }
```

处理规则：
- VS Code 插件工具映射为 Responses function tool：`{ type: 'function', name, description, parameters }`
- 不接入 `web_search_preview`、`file_search`、`code_interpreter` 等内置工具
- `toolChoiceMode` 的语义与 Chat 分支保持一致，但输出结构以 Responses API 为准
- 若第三方 Responses 兼容服务不支持某种 `tool_choice` 形态，用户通过 `toolChoiceMode: 'omit'` 关闭发送

### 5.6 `cmb.responses.request.ts`（新增）

```typescript
export function buildResponsesRequestBody(
  modelId: string,
  input: ResponsesInputItem[],
  instructions: string | undefined,
  maxOutputTokens: number,
  options: { reasoningEffort?: string; tools?: unknown[]; toolChoice?: unknown }
): Record<string, unknown>
```

请求体结构差异：
- `max_output_tokens` 替代 `max_tokens`
- `instructions` 顶层字段
- `reasoning: { effort: '...' }` 替代 `reasoning_effort`
- `stream: true`
- `tools` / `tool_choice` 使用 Responses 形态

### 5.7 `cmb.responses.stream.ts`（新增）

SSE 语义事件解析，关键事件：

| 事件类型 | 处理 |
|---------|------|
| `response.output_text.delta` | `progress.report(TextPart(delta))` |
| `response.output_text.done` | 文本输出完成，无需额外动作 |
| `response.function_call_arguments.delta` | 累积到 pendingFunctionCall.args |
| `response.function_call_arguments.done` | 解析 arguments JSON，`progress.report(ToolCallPart(…))` |
| `response.output_item.added` | 如果 item 是 `function_call`，记录 `item_id/output_index` 对应的 `call_id` 与 `name` |
| `response.output_item.done` | 如果 item 是完整 `function_call`，用其 `call_id/name/arguments` 兜底发出 ToolCallPart |
| `response.reasoning_summary_text.delta` | 若 VS Code 支持 ThinkingPart，则回报 thinking；否则用 DataPart 兜底 |
| `response.completed` | 流结束 |
| `response.failed` | 抛出异常 |

解析要求：
- 支持 `event:` + `data:` 标准 SSE 帧，不再只按 `data:` 行识别。
- 按 `item_id` 优先、`output_index` 兜底管理 pending function call。
- arguments 为空或 JSON 解析失败时回报 `{}`，不要让整段流失败。
- `response.failed` / `response.incomplete` 要把错误信息带入异常。

### 5.8 `cmb.provider.request.ts`（修改）

主要变更：
1. 导入路径调整（`chatCompletions/` 代替 `openaiCompatible/`）
2. 新增 `resolveApiStyle()`：读取 `provider.apiStyle ?? 'chat'`
3. 分支调度：`chat` 走原路径，`responses` 走新路径
4. DeepSeek patch 只应用于 Chat 分支；Responses 分支暂不做 DeepSeek 专属 thinking patch
5. 视觉/附件能力检查保持在分支前，两个 API 风格共享

### 5.9 配置与类型（修改）

```typescript
export type ProviderApiStyle = 'chat' | 'responses';

export interface ProviderConfig {
  // ... 现有字段
  /** API 风格，默认 'chat'；设为 'responses' 启用 OpenAI Responses API */
  apiStyle?: ProviderApiStyle;
}

export type ResponsesInputItem =
  | ResponsesInputMessage
  | ResponsesFunctionCallItem
  | ResponsesFunctionCallOutputItem;

export interface ResponsesInputMessage {
  type: 'message';
  role: 'user' | 'assistant' | 'system' | 'developer';
  content: string | ResponsesContentPart[];
}

export interface ResponsesFunctionCallItem {
  type: 'function_call';
  call_id: string;
  name: string;
  arguments: string;
}

export interface ResponsesFunctionCallOutputItem {
  type: 'function_call_output';
  call_id: string;
  output: string;
}

export interface ResponsesStreamEvent {
  type: string;
  response_id?: string;
  item_id?: string;
  output_index?: number;
  content_index?: number;
  delta?: string;
  text?: string;
  arguments?: string;
  name?: string;
  call_id?: string;
  item?: {
    type: string;
    id?: string;
    name?: string;
    call_id?: string;
    arguments?: string;
  };
}
```

`package.json` 的配置 schema 同步增加 provider 级 `apiStyle` 字段，允许用户通过设置 JSON 手动配置。Webview 管理界面本期不新增可视化控件，但现有配置读写必须保留未知字段，不能保存时丢失 `apiStyle`。

## 六、影响范围

| 文件 | 操作 | 风险等级 |
|------|------|---------|
| `types.ts` | 新增 ProviderApiStyle、Responses input/stream 类型 | 中 |
| `package.json` | provider 配置 schema 增加 `apiStyle` | 低 |
| `cmb.openaiCompatible.chatHttpClient.ts` | 重命名为 `httpClient.ts`，接口微调 | 中 |
| `cmb.openaiCompatible.messages.ts` | 迁入 `chatCompletions/` | 中 |
| `cmb.openaiCompatible.stream.ts` | 迁入 `chatCompletions/` | 中 |
| `cmb.provider.request.ts` | 拆分请求构建，增加 Responses 分支 | 中 |
| `cmb.chatCompletions.request.ts` | 新增（从 request.ts 拆分） | 低 |
| `cmb.chatCompletions.tools.ts` | 新增，Chat 工具参数组装 | 低 |
| `cmb.responses/*` 4 个文件 | 全部新增 | 中 |
| `cmb.openaiCompatible/index.ts` | 调整导出路径 | 低 |

## 七、测试计划

定向测试，不跑全量测试：

1. `src/test/cmb.responses.input.test.ts`
   - user 文本/图片转换为 `input_text` / `input_image`
   - assistant tool call 转为 `function_call`
   - tool result 转为 `function_call_output`
   - system 文本提取为 `instructions`
2. `src/test/cmb.responses.request.test.ts`
   - 请求体使用 `/responses`、`input`、`max_output_tokens`、`stream: true`
   - reasoning 使用 `reasoning: { effort }`
   - tools/tool_choice 使用 Responses 形态
3. `src/test/cmb.responses.stream.test.ts`
   - `response.output_text.delta` 回报 TextPart
   - function call arguments 分片最终回报 ToolCallPart
   - `response.output_item.done` 完整 item 兜底
   - `response.failed` 抛出错误
4. `src/test/cmb.provider.request.test.ts`
   - `apiStyle` 缺省仍请求 `/chat/completions`
   - `apiStyle: 'responses'` 请求 `/responses`

验证命令：

```bash
npm run compile
node --test ./out/test/cmb.responses.input.test.js ./out/test/cmb.responses.request.test.js ./out/test/cmb.responses.stream.test.js ./out/test/cmb.provider.request.test.js
npm run lint
```

## 八、不做的事

- 不做 Provider 级别的 API 端点自动探测
- 不做第三方服务白名单验证
- 不新增 VS Code Webview 配置 UI 控件；只保证设置 schema 与现有保存流程保留 `apiStyle`
- Responses API 的 file_search / code_interpreter / web_search 等内置工具不在本期范围
- 不启用 Responses conversation/stateful 存储能力；本期继续由 VS Code 历史消息驱动
