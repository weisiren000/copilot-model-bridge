# OpenAI Responses API Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add provider-level OpenAI Responses API support while preserving existing Chat Completions behavior and VS Code plugin tool compatibility.

**Architecture:** Keep `src/provider/core/cmb.provider.request.ts` as the protocol dispatcher. Move existing Chat Completions conversion/request/stream code into `openaiCompatible/chatCompletions/`, add `openaiCompatible/responses/` for Responses input item conversion, request body construction, and semantic SSE parsing. The Responses branch must translate Chat-shaped intermediate tool history into `function_call` and `function_call_output` items before sending.

**Tech Stack:** TypeScript, VS Code LanguageModelChatProvider API, Node `node:test`, OpenAI-compatible HTTP/SSE protocol.

---

关联规格：`docs/specs/2026-05-24-openai-responses-api-design.md`

## 文件结构

创建：
- `src/provider/openaiCompatible/chatCompletions/cmb.chatCompletions.messages.ts`
- `src/provider/openaiCompatible/chatCompletions/cmb.chatCompletions.request.ts`
- `src/provider/openaiCompatible/chatCompletions/cmb.chatCompletions.stream.ts`
- `src/provider/openaiCompatible/chatCompletions/cmb.chatCompletions.tools.ts`
- `src/provider/openaiCompatible/chatCompletions/index.ts`
- `src/provider/openaiCompatible/responses/cmb.responses.input.ts`
- `src/provider/openaiCompatible/responses/cmb.responses.request.ts`
- `src/provider/openaiCompatible/responses/cmb.responses.stream.ts`
- `src/provider/openaiCompatible/responses/cmb.responses.tools.ts`
- `src/provider/openaiCompatible/responses/index.ts`
- `src/test/cmb.responses.input.test.ts`
- `src/test/cmb.responses.request.test.ts`
- `src/test/cmb.responses.stream.test.ts`

修改：
- `src/types.ts`
- `package.json`
- `src/provider/openaiCompatible/cmb.openaiCompatible.chatHttpClient.ts`
- `src/provider/openaiCompatible/index.ts`
- `src/provider/core/cmb.provider.request.ts`
- `src/test/cmb.openaiCompatible.messages.test.ts`
- `src/test/cmb.openaiCompatible.stream.test.ts`
- `src/test/cmb.openaiCompatible.chatHttpClient.test.ts`
- `src/test/cmb.provider.request.test.ts`

保留兼容：
- 旧测试文件可以改 import 到新路径，不需要保留旧模块出口。
- `apiStyle` 缺省为 `chat`，现有 provider 配置不需要迁移。

## Task 1: 类型与配置入口

**Files:**
- Modify: `src/types.ts`
- Modify: `package.json`
- Test: `src/test/cmb.provider.configManagement.test.ts`

- [ ] **Step 1: Write the failing type/config validation test**

在 `src/test/cmb.provider.configManagement.test.ts` 增加：

```typescript
test('accepts provider apiStyle values without validation issues', () => {
  const issues = validateProviderConfig([{
    ...createProviders()[0],
    apiStyle: 'responses',
  }]);

  assert.deepEqual(issues, []);
});
```

- [ ] **Step 2: Run test to verify compile fails**

Run:

```bash
npm run compile
```

Expected: FAIL，因为 `ProviderConfig` 还没有 `apiStyle` 字段。

- [ ] **Step 3: Add shared Responses types**

在 `src/types.ts` 增加：

```typescript
export type ProviderApiStyle = 'chat' | 'responses';

export type ResponsesContentPart =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; detail?: 'low' | 'high' | 'auto' | 'original' }
  | { type: 'output_text'; text: string };

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
  error?: { message?: string; code?: string };
  response?: { status?: string; error?: { message?: string; code?: string } };
  item?: {
    type: string;
    id?: string;
    name?: string;
    call_id?: string;
    arguments?: string;
  };
}
```

在 `ProviderConfig` 中增加：

```typescript
/** API style used by this provider. Defaults to Chat Completions. */
apiStyle?: ProviderApiStyle;
```

- [ ] **Step 4: Add package configuration schema**

在 `package.json` 的 provider `properties` 中、`apiKey` 后增加：

```json
"apiStyle": {
  "type": "string",
  "default": "chat",
  "enum": ["chat", "responses"],
  "description": "API style for this provider. Use chat for /chat/completions or responses for /responses."
}
```

- [ ] **Step 5: Run targeted validation**

Run:

```bash
npm run compile
node --test ./out/test/cmb.provider.configManagement.test.js
```

Expected: PASS.

## Task 2: HTTP client URL generalization

**Files:**
- Modify: `src/provider/openaiCompatible/cmb.openaiCompatible.chatHttpClient.ts`
- Modify: `src/test/cmb.openaiCompatible.chatHttpClient.test.ts`

- [ ] **Step 1: Write failing test for generic client export**

在 `src/test/cmb.openaiCompatible.chatHttpClient.test.ts` 增加 import 与测试：

```typescript
const {
  postStreaming,
} = require('../provider/openaiCompatible/cmb.openaiCompatible.chatHttpClient') as typeof import('../provider/openaiCompatible/cmb.openaiCompatible.chatHttpClient');

test('posts streaming request to arbitrary OpenAI-compatible path', async () => {
  let receivedPath = '';
  const server = http.createServer((req, res) => {
    receivedPath = req.url ?? '';
    req.resume();
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end('data: [DONE]\n\n');
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;

  try {
    const response = await postStreaming(
      `http://127.0.0.1:${address.port}/v1/responses`,
      { Authorization: 'Bearer key', 'Content-Type': 'application/json' },
      { stream: true },
      new AbortController().signal
    );

    assert.equal(response.ok, true);
    assert.equal(receivedPath, '/v1/responses');
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run compile
node --test ./out/test/cmb.openaiCompatible.chatHttpClient.test.js
```

Expected: FAIL because `postStreaming` is not exported.

- [ ] **Step 3: Export generic client and keep compatibility**

把 `postStreamingChatCompletion` 改成包装函数：

```typescript
export function postStreaming(
  requestUrl: string,
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal
): Promise<Response> {
  const url = new URL(requestUrl);
  const payload = JSON.stringify(body);
  const transport = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const request = transport.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(payload).toString(),
      },
    }, response => {
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        appendResponseHeader(responseHeaders, name, value);
      }

      resolve(new Response(Readable.toWeb(response) as ReadableStream<Uint8Array>, {
        status: response.statusCode ?? 500,
        statusText: response.statusMessage,
        headers: responseHeaders,
      }));
    });

    const abort = () => {
      request.destroy(Object.assign(new Error('The operation was aborted.'), {
        name: 'AbortError',
      }));
    };

    if (signal.aborted) {
      abort();
      return;
    }

    signal.addEventListener('abort', abort, { once: true });
    request.on('error', reject);
    request.on('close', () => signal.removeEventListener('abort', abort));
    request.end(payload);
  });
}

export const postStreamingChatCompletion = postStreaming;
```

- [ ] **Step 4: Run targeted test**

Run:

```bash
npm run compile
node --test ./out/test/cmb.openaiCompatible.chatHttpClient.test.js
```

Expected: PASS.

## Task 3: Move Chat Completions modules

**Files:**
- Create: `src/provider/openaiCompatible/chatCompletions/cmb.chatCompletions.messages.ts`
- Create: `src/provider/openaiCompatible/chatCompletions/cmb.chatCompletions.stream.ts`
- Create: `src/provider/openaiCompatible/chatCompletions/index.ts`
- Modify: `src/test/cmb.openaiCompatible.messages.test.ts`
- Modify: `src/test/cmb.openaiCompatible.stream.test.ts`

- [ ] **Step 1: Move existing files**

Move:

```text
src/provider/openaiCompatible/cmb.openaiCompatible.messages.ts
-> src/provider/openaiCompatible/chatCompletions/cmb.chatCompletions.messages.ts

src/provider/openaiCompatible/cmb.openaiCompatible.stream.ts
-> src/provider/openaiCompatible/chatCompletions/cmb.chatCompletions.stream.ts
```

Update imports inside moved files:

```typescript
// messages file
import { decodeReasoningDataPart } from '../../deepseek/cmb.deepseek.adapter';
import { buildOpenAIContent, createOpenAIDataPartContent, OpenAIContentPart } from '../cmb.openaiCompatible.content';
import { TokenEstimatePart } from '../cmb.openaiCompatible.token';
import { isThinkingPart, readThinkingValue } from './cmb.chatCompletions.stream';

// stream file
import { DEEPSEEK_REASONING_MIME } from '../../deepseek/cmb.deepseek.adapter';
import { OpenAIStreamChunk } from '../../../types';
```

- [ ] **Step 2: Add chatCompletions index**

Create `src/provider/openaiCompatible/chatCompletions/index.ts`:

```typescript
export * from './cmb.chatCompletions.messages';
export * from './cmb.chatCompletions.stream';
```

- [ ] **Step 3: Update tests to new imports**

In `src/test/cmb.openaiCompatible.messages.test.ts`:

```typescript
} = require('../provider/openaiCompatible/chatCompletions/cmb.chatCompletions.messages') as typeof import('../provider/openaiCompatible/chatCompletions/cmb.chatCompletions.messages');
```

In `src/test/cmb.openaiCompatible.stream.test.ts`:

```typescript
} = require('../provider/openaiCompatible/chatCompletions/cmb.chatCompletions.stream') as typeof import('../provider/openaiCompatible/chatCompletions/cmb.chatCompletions.stream');
```

- [ ] **Step 4: Run moved-module tests**

Run:

```bash
npm run compile
node --test ./out/test/cmb.openaiCompatible.messages.test.js ./out/test/cmb.openaiCompatible.stream.test.js
```

Expected: PASS.

## Task 4: Extract Chat request and tool builders

**Files:**
- Create: `src/provider/openaiCompatible/chatCompletions/cmb.chatCompletions.tools.ts`
- Create: `src/provider/openaiCompatible/chatCompletions/cmb.chatCompletions.request.ts`
- Modify: `src/provider/openaiCompatible/chatCompletions/index.ts`
- Test: `src/test/cmb.provider.request.test.ts`

- [ ] **Step 1: Create Chat tool builder**

Create `src/provider/openaiCompatible/chatCompletions/cmb.chatCompletions.tools.ts`:

```typescript
import * as vscode from 'vscode';
import { ToolChoiceMode } from '../../../types';
import { resolveToolChoice } from '..';

export function buildChatToolOptions(
  options: vscode.ProvideLanguageModelChatResponseOptions,
  toolChoiceMode: ToolChoiceMode | undefined
): { tools?: unknown[]; tool_choice?: unknown } {
  if (!options.tools || options.tools.length === 0) {
    return {};
  }

  const result: { tools?: unknown[]; tool_choice?: unknown } = {
    tools: options.tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    })),
  };

  const toolChoice = resolveToolChoice({
    hasTools: true,
    requestedToolMode: options.toolMode === vscode.LanguageModelChatToolMode.Required ? 'required' : 'auto',
    toolChoiceMode,
  });

  if (toolChoice !== undefined) {
    result.tool_choice = toolChoice;
  }

  return result;
}
```

- [ ] **Step 2: Create Chat request builder**

Create `src/provider/openaiCompatible/chatCompletions/cmb.chatCompletions.request.ts`:

```typescript
import * as vscode from 'vscode';
import { ReasoningLevel, ToolChoiceMode } from '../../../types';
import { resolveReasoningLevel } from '..';
import { buildChatToolOptions } from './cmb.chatCompletions.tools';

export interface ChatRequestOptions {
  modelId: string;
  messages: unknown[];
  maxOutputTokens: number;
  supportsReasoning?: boolean;
  defaultReasoningLevel?: ReasoningLevel;
  supportedReasoningLevels?: ReasoningLevel[];
  toolChoiceMode?: ToolChoiceMode;
  responseOptions: vscode.ProvideLanguageModelChatResponseOptions;
  modelConfiguration?: { readonly [name: string]: unknown };
}

export function buildChatRequestBody(options: ChatRequestOptions): Record<string, unknown> {
  const requestBody: Record<string, unknown> = {
    model: options.modelId,
    messages: options.messages,
    stream: true,
    max_tokens: options.maxOutputTokens,
  };

  if (options.supportsReasoning) {
    requestBody.reasoning_effort = resolveReasoningLevel(
      options.responseOptions.modelOptions,
      options.modelConfiguration,
      options.defaultReasoningLevel ?? 'medium',
      options.supportedReasoningLevels
    );
  }

  Object.assign(requestBody, buildChatToolOptions(
    options.responseOptions,
    options.toolChoiceMode
  ));

  return requestBody;
}
```

- [ ] **Step 3: Export builders**

Update `src/provider/openaiCompatible/chatCompletions/index.ts`:

```typescript
export * from './cmb.chatCompletions.messages';
export * from './cmb.chatCompletions.request';
export * from './cmb.chatCompletions.stream';
export * from './cmb.chatCompletions.tools';
```

- [ ] **Step 4: Keep provider request behavior unchanged**

Update `src/provider/core/cmb.provider.request.ts` to import `convertMessages`, `consumeSSEStream`, and `buildChatRequestBody` from `chatCompletions/`. Replace inline Chat body construction with `buildChatRequestBody()`. Keep `applyDeepSeekRequestPatch()` after body creation.

- [ ] **Step 5: Run existing request tests**

Run:

```bash
npm run compile
node --test ./out/test/cmb.provider.request.test.js
```

Expected: PASS.

## Task 5: Responses input conversion

**Files:**
- Create: `src/provider/openaiCompatible/responses/cmb.responses.input.ts`
- Create: `src/provider/openaiCompatible/responses/index.ts`
- Test: `src/test/cmb.responses.input.test.ts`

- [ ] **Step 1: Write failing input conversion tests**

Create `src/test/cmb.responses.input.test.ts` with VS Code mock matching `cmb.openaiCompatible.messages.test.ts`. Add:

```typescript
test('converts user text and image content to Responses input parts', () => {
  const { convertToResponsesInput } = require('../provider/openaiCompatible/responses/cmb.responses.input') as typeof import('../provider/openaiCompatible/responses/cmb.responses.input');

  const result = convertToResponsesInput([{
    role: 'user',
    content: [
      { type: 'text', text: 'look' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,/w==' } },
    ],
  }]);

  assert.deepEqual(result, {
    input: [{
      type: 'message',
      role: 'user',
      content: [
        { type: 'input_text', text: 'look' },
        { type: 'input_image', image_url: 'data:image/png;base64,/w==' },
      ],
    }],
  });
});

test('converts Chat tool history to Responses function call items', () => {
  const { convertToResponsesInput } = require('../provider/openaiCompatible/responses/cmb.responses.input') as typeof import('../provider/openaiCompatible/responses/cmb.responses.input');

  const result = convertToResponsesInput([
    {
      role: 'assistant',
      content: null,
      tool_calls: [{
        id: 'call-1',
        type: 'function',
        function: {
          name: 'read_file',
          arguments: '{"path":"README.md"}',
        },
      }],
    },
    {
      role: 'tool',
      tool_call_id: 'call-1',
      name: 'read_file',
      content: 'file contents',
    },
  ]);

  assert.deepEqual(result.input, [
    {
      type: 'function_call',
      call_id: 'call-1',
      name: 'read_file',
      arguments: '{"path":"README.md"}',
    },
    {
      type: 'function_call_output',
      call_id: 'call-1',
      output: 'file contents',
    },
  ]);
});

test('extracts system text into instructions', () => {
  const { convertToResponsesInput } = require('../provider/openaiCompatible/responses/cmb.responses.input') as typeof import('../provider/openaiCompatible/responses/cmb.responses.input');

  assert.deepEqual(convertToResponsesInput([
    { role: 'system', content: 'Be concise.' },
    { role: 'user', content: 'hello' },
  ]), {
    instructions: 'Be concise.',
    input: [{
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: 'hello' }],
    }],
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run compile
node --test ./out/test/cmb.responses.input.test.js
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement conversion helpers**

Create `src/provider/openaiCompatible/responses/cmb.responses.input.ts`:

```typescript
import { ResponsesContentPart, ResponsesInputItem } from '../../../types';

interface ChatMessage {
  role: string;
  content?: unknown;
  tool_calls?: Array<{
    id?: string;
    function?: { name?: string; arguments?: string };
  }>;
  tool_call_id?: string;
}

export function convertToResponsesInput(
  messages: ChatMessage[]
): { instructions?: string; input: ResponsesInputItem[] } {
  const instructions: string[] = [];
  const input: ResponsesInputItem[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      const text = readTextContent(message.content);
      if (text) {
        instructions.push(text);
        continue;
      }
    }

    if (message.role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: message.tool_call_id ?? '',
        output: readTextContent(message.content) || 'Success',
      });
      continue;
    }

    if (message.role === 'assistant') {
      pushAssistantMessage(input, message);
      continue;
    }

    input.push({
      type: 'message',
      role: message.role === 'developer' ? 'developer' : 'user',
      content: convertContentParts(message.content, 'input'),
    });
  }

  return instructions.length > 0
    ? { instructions: instructions.join('\n'), input }
    : { input };
}

function pushAssistantMessage(input: ResponsesInputItem[], message: ChatMessage): void {
  const content = convertContentParts(message.content, 'output');
  if (content.length > 0) {
    input.push({ type: 'message', role: 'assistant', content });
  }

  for (const toolCall of message.tool_calls ?? []) {
    input.push({
      type: 'function_call',
      call_id: toolCall.id ?? '',
      name: toolCall.function?.name ?? '',
      arguments: toolCall.function?.arguments ?? '{}',
    });
  }
}

function convertContentParts(value: unknown, mode: 'input' | 'output'): ResponsesContentPart[] {
  if (typeof value === 'string') {
    return value ? [createTextPart(value, mode)] : [];
  }
  if (!Array.isArray(value)) {
    return [];
  }

  const parts: ResponsesContentPart[] = [];
  for (const part of value) {
    if (part?.type === 'text' && typeof part.text === 'string') {
      parts.push(createTextPart(part.text, mode));
    } else if (part?.type === 'image_url' && typeof part.image_url?.url === 'string') {
      parts.push({ type: 'input_image', image_url: part.image_url.url });
    }
  }
  return parts;
}

function createTextPart(text: string, mode: 'input' | 'output'): ResponsesContentPart {
  return mode === 'output'
    ? { type: 'output_text', text }
    : { type: 'input_text', text };
}

function readTextContent(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (!Array.isArray(value)) {
    return '';
  }
  return value
    .map(part => part?.type === 'text' && typeof part.text === 'string' ? part.text : '')
    .join('');
}
```

- [ ] **Step 4: Add responses index**

Create `src/provider/openaiCompatible/responses/index.ts`:

```typescript
export * from './cmb.responses.input';
```

- [ ] **Step 5: Run targeted test**

Run:

```bash
npm run compile
node --test ./out/test/cmb.responses.input.test.js
```

Expected: PASS.

## Task 6: Responses tools and request builder

**Files:**
- Create: `src/provider/openaiCompatible/responses/cmb.responses.tools.ts`
- Create: `src/provider/openaiCompatible/responses/cmb.responses.request.ts`
- Modify: `src/provider/openaiCompatible/responses/index.ts`
- Test: `src/test/cmb.responses.request.test.ts`

- [ ] **Step 1: Write failing request builder tests**

Create `src/test/cmb.responses.request.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';

test('builds Responses request body with max_output_tokens and reasoning', () => {
  const {
    buildResponsesRequestBody,
  } = require('../provider/openaiCompatible/responses/cmb.responses.request') as typeof import('../provider/openaiCompatible/responses/cmb.responses.request');

  const body = buildResponsesRequestBody({
    modelId: 'gpt-5.1',
    input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hello' }] }],
    instructions: 'Be concise.',
    maxOutputTokens: 123,
    reasoningEffort: 'medium',
    toolOptions: {},
  });

  assert.deepEqual(body, {
    model: 'gpt-5.1',
    input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hello' }] }],
    instructions: 'Be concise.',
    stream: true,
    max_output_tokens: 123,
    reasoning: { effort: 'medium' },
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run compile
node --test ./out/test/cmb.responses.request.test.js
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement Responses tools**

Create `src/provider/openaiCompatible/responses/cmb.responses.tools.ts`:

```typescript
import * as vscode from 'vscode';
import { ToolChoiceMode } from '../../../types';
import { resolveToolChoice } from '..';

export function buildResponsesToolOptions(
  options: vscode.ProvideLanguageModelChatResponseOptions,
  toolChoiceMode: ToolChoiceMode | undefined
): { tools?: unknown[]; tool_choice?: unknown } {
  if (!options.tools || options.tools.length === 0) {
    return {};
  }

  const result: { tools?: unknown[]; tool_choice?: unknown } = {
    tools: options.tools.map(tool => ({
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    })),
  };

  const toolChoice = resolveToolChoice({
    hasTools: true,
    requestedToolMode: options.toolMode === vscode.LanguageModelChatToolMode.Required ? 'required' : 'auto',
    toolChoiceMode,
  });

  if (toolChoice !== undefined) {
    result.tool_choice = toolChoice;
  }

  return result;
}
```

- [ ] **Step 4: Implement Responses request builder**

Create `src/provider/openaiCompatible/responses/cmb.responses.request.ts`:

```typescript
import { ReasoningLevel, ResponsesInputItem } from '../../../types';

export interface ResponsesRequestOptions {
  modelId: string;
  input: ResponsesInputItem[];
  instructions?: string;
  maxOutputTokens: number;
  reasoningEffort?: ReasoningLevel;
  toolOptions: { tools?: unknown[]; tool_choice?: unknown };
}

export function buildResponsesRequestBody(options: ResponsesRequestOptions): Record<string, unknown> {
  const requestBody: Record<string, unknown> = {
    model: options.modelId,
    input: options.input,
    stream: true,
    max_output_tokens: options.maxOutputTokens,
  };

  if (options.instructions) {
    requestBody.instructions = options.instructions;
  }
  if (options.reasoningEffort && options.reasoningEffort !== 'none') {
    requestBody.reasoning = { effort: options.reasoningEffort };
  }

  Object.assign(requestBody, options.toolOptions);
  return requestBody;
}
```

- [ ] **Step 5: Export modules**

Update `src/provider/openaiCompatible/responses/index.ts`:

```typescript
export * from './cmb.responses.input';
export * from './cmb.responses.request';
export * from './cmb.responses.tools';
```

- [ ] **Step 6: Run targeted test**

Run:

```bash
npm run compile
node --test ./out/test/cmb.responses.request.test.js
```

Expected: PASS.

## Task 7: Responses stream parser

**Files:**
- Create: `src/provider/openaiCompatible/responses/cmb.responses.stream.ts`
- Modify: `src/provider/openaiCompatible/responses/index.ts`
- Test: `src/test/cmb.responses.stream.test.ts`

- [ ] **Step 1: Write failing stream tests**

Create `src/test/cmb.responses.stream.test.ts` with VS Code mock matching existing stream test. Add tests for:

```typescript
test('reports output text deltas', async () => {
  const reported: unknown[] = [];
  await consumeResponsesSSEStream(streamFrom([
    'event: response.output_text.delta',
    'data: {"type":"response.output_text.delta","delta":"Hello"}',
    '',
    'event: response.completed',
    'data: {"type":"response.completed"}',
    '',
  ]), { report: part => reported.push(part) } as never, neverCancelledToken);

  assert.deepEqual(reported.map(part => (part as { value: string }).value), ['Hello']);
});

test('reports function call from streamed arguments', async () => {
  const reported: unknown[] = [];
  await consumeResponsesSSEStream(streamFrom([
    'event: response.output_item.added',
    'data: {"type":"response.output_item.added","item_id":"item-1","output_index":0,"item":{"type":"function_call","call_id":"call-1","name":"read_file"}}',
    '',
    'event: response.function_call_arguments.delta',
    'data: {"type":"response.function_call_arguments.delta","item_id":"item-1","delta":"{\\"path\\":"}',
    '',
    'event: response.function_call_arguments.done',
    'data: {"type":"response.function_call_arguments.done","item_id":"item-1","arguments":"{\\"path\\":\\"README.md\\"}"}',
    '',
  ]), { report: part => reported.push(part) } as never, neverCancelledToken);

  assert.equal((reported[0] as { callId: string }).callId, 'call-1');
  assert.equal((reported[0] as { name: string }).name, 'read_file');
  assert.deepEqual((reported[0] as { input: unknown }).input, { path: 'README.md' });
});
```

Use helper:

```typescript
function streamFrom(lines: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`${lines.join('\n')}\n`));
      controller.close();
    },
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run compile
node --test ./out/test/cmb.responses.stream.test.js
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement stream parser**

Create `src/provider/openaiCompatible/responses/cmb.responses.stream.ts` with:

```typescript
import * as vscode from 'vscode';
import { ResponsesStreamEvent } from '../../../types';
import { DEEPSEEK_REASONING_MIME } from '../../deepseek/cmb.deepseek.adapter';
import { reportThinkingPart } from '../chatCompletions/cmb.chatCompletions.stream';

interface PendingFunctionCall {
  callId: string;
  name: string;
  arguments: string;
  reported: boolean;
}

export async function consumeResponsesSSEStream(
  body: ReadableStream<Uint8Array>,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  token: vscode.CancellationToken
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const calls = new Map<string, PendingFunctionCall>();
  let buffer = '';
  let reasoningBuffer = '';
  let reasoningStreamed = false;

  try {
    while (!token.isCancellationRequested) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const event = parseFrame(frame);
        if (!event) {
          continue;
        }
        handleEvent(event, calls, progress);
        if (event.type === 'response.reasoning_summary_text.delta' && event.delta) {
          reasoningBuffer += event.delta;
          reasoningStreamed = reportThinkingPart(progress, event.delta) || reasoningStreamed;
        }
        if (event.type === 'response.failed' || event.type === 'response.incomplete') {
          throw new Error(readResponseError(event));
        }
      }
    }
  } finally {
    if (reasoningBuffer && !reasoningStreamed) {
      progress.report(new vscode.LanguageModelDataPart(
        new TextEncoder().encode(reasoningBuffer),
        DEEPSEEK_REASONING_MIME
      ));
    }
    reader.releaseLock();
  }
}
```

Add these local helpers in the same file:

```typescript
function parseFrame(frame: string): ResponsesStreamEvent | undefined {
  const dataLines = frame
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('data: '))
    .map(line => line.slice('data: '.length));

  if (dataLines.length === 0) {
    return undefined;
  }

  const data = dataLines.join('\n');
  if (data === '[DONE]') {
    return { type: 'response.completed' };
  }

  try {
    return JSON.parse(data) as ResponsesStreamEvent;
  } catch {
    return undefined;
  }
}

function handleEvent(
  event: ResponsesStreamEvent,
  calls: Map<string, PendingFunctionCall>,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>
): void {
  if (event.type === 'response.output_text.delta' && event.delta) {
    progress.report(new vscode.LanguageModelTextPart(event.delta));
    return;
  }

  if (event.type === 'response.output_item.added' || event.type === 'response.output_item.done') {
    trackFunctionCall(event, calls);
  }

  if (event.type === 'response.function_call_arguments.delta') {
    appendFunctionArguments(event, calls);
    return;
  }

  if (event.type === 'response.function_call_arguments.done') {
    appendFunctionArguments(event, calls);
    reportFunctionCall(event, calls, progress);
  }

  if (event.type === 'response.output_item.done') {
    reportFunctionCall(event, calls, progress);
  }
}

function trackFunctionCall(
  event: ResponsesStreamEvent,
  calls: Map<string, PendingFunctionCall>
): void {
  if (event.item?.type !== 'function_call') {
    return;
  }

  const key = readCallKey(event);
  const current = calls.get(key);
  calls.set(key, {
    callId: event.item.call_id ?? current?.callId ?? key,
    name: event.item.name ?? current?.name ?? '',
    arguments: event.item.arguments ?? current?.arguments ?? '',
    reported: current?.reported ?? false,
  });
}

function appendFunctionArguments(
  event: ResponsesStreamEvent,
  calls: Map<string, PendingFunctionCall>
): void {
  const key = readCallKey(event);
  const current = calls.get(key) ?? {
    callId: event.call_id ?? key,
    name: event.name ?? '',
    arguments: '',
    reported: false,
  };

  calls.set(key, {
    ...current,
    arguments: event.arguments ?? `${current.arguments}${event.delta ?? ''}`,
  });
}

function reportFunctionCall(
  event: ResponsesStreamEvent,
  calls: Map<string, PendingFunctionCall>,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>
): void {
  const key = readCallKey(event);
  const call = calls.get(key);
  if (!call || call.reported) {
    return;
  }

  call.reported = true;
  progress.report(new vscode.LanguageModelToolCallPart(
    call.callId,
    call.name,
    safeParseArguments(call.arguments)
  ));
}

function readCallKey(event: ResponsesStreamEvent): string {
  if (event.item_id) {
    return event.item_id;
  }
  if (event.item?.id) {
    return event.item.id;
  }
  if (event.output_index !== undefined) {
    return `output:${event.output_index}`;
  }
  return event.call_id ?? 'call:0';
}

function safeParseArguments(value: string): unknown {
  if (!value) {
    return {};
  }
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function readResponseError(event: ResponsesStreamEvent): string {
  return event.error?.message
    ?? event.response?.error?.message
    ?? `Responses API stream failed: ${event.type}`;
}
```

- [ ] **Step 4: Export stream parser**

Update `src/provider/openaiCompatible/responses/index.ts`:

```typescript
export * from './cmb.responses.input';
export * from './cmb.responses.request';
export * from './cmb.responses.stream';
export * from './cmb.responses.tools';
```

- [ ] **Step 5: Run targeted stream test**

Run:

```bash
npm run compile
node --test ./out/test/cmb.responses.stream.test.js
```

Expected: PASS.

## Task 8: Provider request dispatcher

**Files:**
- Modify: `src/provider/core/cmb.provider.request.ts`
- Modify: `src/test/cmb.provider.request.test.ts`

- [ ] **Step 1: Add failing Responses path integration test**

在 `src/test/cmb.provider.request.test.ts` 增加：

```typescript
test('sends Responses request when provider apiStyle is responses', async () => {
  let receivedPath = '';
  let receivedBody: Record<string, unknown> | undefined;
  const server = http.createServer((req, res) => {
    receivedPath = req.url ?? '';
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      receivedBody = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end([
        'event: response.output_text.delta',
        'data: {"type":"response.output_text.delta","delta":"hello"}',
        '',
        'event: response.completed',
        'data: {"type":"response.completed"}',
        '',
      ].join('\n'));
    });
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const provider: ProviderConfig = {
    id: 'openai',
    displayName: 'OpenAI',
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    apiKey: 'key',
    apiStyle: 'responses',
    models: [],
  };

  try {
    await sendChatRequest(
      provider,
      { id: 'gpt-5.1', name: 'GPT 5.1' },
      {
        id: 'openai::gpt-5.1',
        name: 'GPT 5.1',
        family: 'gpt',
        version: '',
        maxInputTokens: 128000,
        maxOutputTokens: 4096,
        capabilities: {},
      },
      [{ role: vscodeMock.LanguageModelChatMessageRole.User, content: [new LanguageModelTextPart('hello')] }] as never,
      { toolMode: 0 } as never,
      { report() {} },
      { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) } as never
    );

    assert.equal(receivedPath, '/v1/responses');
    assert.equal(receivedBody?.max_output_tokens, 4096);
    assert.equal(receivedBody?.max_tokens, undefined);
    assert.equal(receivedBody?.stream, true);
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run compile
node --test ./out/test/cmb.provider.request.test.js
```

Expected: FAIL because dispatcher still always calls `/chat/completions`.

- [ ] **Step 3: Implement dispatcher**

In `src/provider/core/cmb.provider.request.ts`:

```typescript
function resolveApiStyle(provider: Pick<ProviderConfig, 'apiStyle'>): 'chat' | 'responses' {
  return provider.apiStyle === 'responses' ? 'responses' : 'chat';
}
```

Add branch:

```typescript
if (resolveApiStyle(provider) === 'responses') {
  await sendResponsesRequest(/* existing local context */);
  return;
}

await sendChatCompletionsRequest(/* existing local context */);
```

The Responses branch must:
- build URL `${provider.baseUrl}/responses`
- call `convertMessages()` first
- call `convertToResponsesInput()`
- resolve reasoning with `resolveReasoningLevel()` only when `selectedModel.supportsReasoning`
- build tools with `buildResponsesToolOptions()`
- call `postStreaming()`
- parse stream with `consumeResponsesSSEStream()`

The Chat branch must keep current DeepSeek patch behavior.

- [ ] **Step 4: Run dispatcher tests**

Run:

```bash
npm run compile
node --test ./out/test/cmb.provider.request.test.js ./out/test/cmb.responses.input.test.js ./out/test/cmb.responses.stream.test.js
```

Expected: PASS.

## Task 9: Exports, old-path cleanup, and targeted verification

**Files:**
- Modify: `src/provider/openaiCompatible/index.ts`
- Modify: any imports found by search

- [ ] **Step 1: Update aggregate exports**

Update `src/provider/openaiCompatible/index.ts` to include:

```typescript
export * from './chatCompletions';
export * from './responses';
```

Keep existing exports for content, capabilities, reasoning, token, billing, request headers, and models catalog.

- [ ] **Step 2: Search for stale imports**

Run:

```bash
rg "cmb.openaiCompatible.messages|cmb.openaiCompatible.stream|postStreamingChatCompletion|/chat/completions|tool_calls 格式保持不变|Responsive API" src docs
```

Expected:
- No production import from removed `cmb.openaiCompatible.messages` or `cmb.openaiCompatible.stream`.
- `postStreamingChatCompletion` only appears as compatibility alias or test coverage.
- `/chat/completions` only appears in Chat branch, docs, or tests.
- No typo `Responsive API`.

- [ ] **Step 3: Run final targeted verification**

Run:

```bash
npm run compile
node --test ./out/test/cmb.responses.input.test.js ./out/test/cmb.responses.request.test.js ./out/test/cmb.responses.stream.test.js ./out/test/cmb.provider.request.test.js ./out/test/cmb.openaiCompatible.messages.test.js ./out/test/cmb.openaiCompatible.stream.test.js ./out/test/cmb.openaiCompatible.chatHttpClient.test.js
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Check changed files**

Run:

```bash
git status --short
```

Expected: only Responses API implementation files, related tests, and docs are changed. Do not commit unless the user explicitly asks.

## 风险与验收

风险：
- 工具调用历史格式是最大风险；必须用 `function_call` / `function_call_output` 测试锁住。
- SSE 事件顺序可能因第三方兼容服务不同而变化；parser 需要 `output_item.added` 和 `output_item.done` 双路径。
- Webview 本期不加 UI 控件；必须保证保存 provider 时不丢 `apiStyle`。

成功标准：
- 缺省 provider 仍请求 `/chat/completions`。
- `apiStyle: 'responses'` 请求 `/responses`。
- 文本流、工具调用流、工具结果回传都能在 Responses 分支跑通。
- 不接入 OpenAI 内置工具，不启用 conversation/stateful storage。
- 定向测试、编译和 lint 全部通过。
