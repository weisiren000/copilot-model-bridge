import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import { DEEPSEEK_REASONING_MIME } from '../provider/deepseek/cmb.deepseek.adapter';
import { GEMINI_THOUGHT_SIGNATURE_MIME } from '../provider/gemini/cmb.gemini.adapter';

class CancellationTokenSource {
  readonly token = {
    isCancellationRequested: false,
    onCancellationRequested: () => ({ dispose() {} }),
  };
}

class LanguageModelTextPart {
  constructor(readonly value: string) {}
}

class LanguageModelDataPart {
  constructor(readonly data: Uint8Array, readonly mimeType?: string) {}
}

class LanguageModelToolCallPart {
  constructor(
    readonly callId: string,
    readonly name: string,
    readonly input: unknown
  ) {}
}

class LanguageModelThinkingPart {
  constructor(readonly value: string) {}
}

const vscodeMock = {
  CancellationTokenSource,
  LanguageModelDataPart,
  LanguageModelTextPart,
  LanguageModelThinkingPart,
  LanguageModelToolCallPart,
};

const moduleLoader = Module as unknown as {
  _load(
    request: string,
    parent: unknown,
    isMain: boolean
  ): unknown;
};
const originalLoad = moduleLoader._load;
moduleLoader._load = function loadWithVscodeMock(
  request: string,
  parent: unknown,
  isMain: boolean
): unknown {
  if (request === 'vscode') {
    return vscodeMock;
  }
  return originalLoad.call(this, request, parent, isMain);
};

const {
  consumeSSEStream,
} = require('../provider/openaiCompatible/chatCompletions/cmb.chatCompletions.stream') as typeof import('../provider/openaiCompatible/chatCompletions/cmb.chatCompletions.stream');

function createSSEStream(lines: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(lines.join('\n')));
      controller.close();
    },
  });
}

async function collectStreamParts(lines: readonly string[]): Promise<unknown[]> {
  const parts: unknown[] = [];
  await consumeSSEStream(
    createSSEStream(lines),
    { report: part => parts.push(part) },
    new CancellationTokenSource().token
  );
  return parts;
}

test('streams text deltas as LanguageModelTextPart instances', async () => {
  const parts = await collectStreamParts([
    'data: {"choices":[{"delta":{"content":"Hel"},"finish_reason":null}]}',
    'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":null}]}',
    'data: [DONE]',
  ]);

  assert.deepEqual(
    parts.map(part => (part as LanguageModelTextPart).value),
    ['Hel', 'lo']
  );
  assert.ok(parts.every(part => part instanceof LanguageModelTextPart));
});

test('reports Chat Completions usage for the context window widget', async () => {
  const parts = await collectStreamParts([
    'data: {"choices":[],"usage":{"prompt_tokens":120,"completion_tokens":30,"total_tokens":150}}',
    'data: [DONE]',
  ]);

  assert.equal(parts.length, 1);
  assert.ok(parts[0] instanceof LanguageModelDataPart);
  assert.equal((parts[0] as LanguageModelDataPart).mimeType, 'usage');
  assert.deepEqual(
    JSON.parse(new TextDecoder().decode((parts[0] as LanguageModelDataPart).data)),
    { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 }
  );
});

test('uses stable data parts for reasoning even when proposed ThinkingPart exists', async () => {
  const parts = await collectStreamParts([
    'data: {"choices":[{"delta":{"reasoning_content":"because"},"finish_reason":null}]}',
    'data: [DONE]',
  ]);

  assert.equal(parts.length, 1);
  assert.ok(parts[0] instanceof LanguageModelDataPart);
  assert.equal((parts[0] as LanguageModelDataPart).mimeType, DEEPSEEK_REASONING_MIME);
  assert.equal(new TextDecoder().decode((parts[0] as LanguageModelDataPart).data), 'because');
});

test('preserves Gemini reasoning in a stable data part', async () => {
  const parts = await collectStreamParts([
    'data: {"choices":[{"delta":{"reasoning":"thinking step"},"finish_reason":null}]}',
    'data: {"choices":[{"delta":{"content":"final answer"},"finish_reason":null}]}',
    'data: [DONE]',
  ]);

  assert.equal(parts.length, 2);
  assert.ok(parts[0] instanceof LanguageModelTextPart);
  assert.equal((parts[0] as LanguageModelTextPart).value, 'final answer');
  assert.ok(parts[1] instanceof LanguageModelDataPart);
  assert.equal((parts[1] as LanguageModelDataPart).mimeType, DEEPSEEK_REASONING_MIME);
  assert.equal(new TextDecoder().decode((parts[1] as LanguageModelDataPart).data), 'thinking step');
});

test('preserves Gemini tagged thoughts in a stable data part', async () => {
  const parts = await collectStreamParts([
    'data: {"choices":[{"delta":{"content":"<think>plan"},"finish_reason":null}]}',
    'data: {"choices":[{"delta":{"content":" first</think>answer"},"finish_reason":null}]}',
    'data: [DONE]',
  ]);

  assert.equal(parts.length, 2);
  assert.ok(parts[0] instanceof LanguageModelTextPart);
  assert.equal((parts[0] as LanguageModelTextPart).value, 'answer');
  assert.ok(parts[1] instanceof LanguageModelDataPart);
  assert.equal(new TextDecoder().decode((parts[1] as LanguageModelDataPart).data), 'plan first');
});

test('falls back to reasoning data part when ThinkingPart is unavailable', async () => {
  const previousThinkingPart = vscodeMock.LanguageModelThinkingPart;
  delete (vscodeMock as { LanguageModelThinkingPart?: typeof LanguageModelThinkingPart })
    .LanguageModelThinkingPart;
  try {
    const parts = await collectStreamParts([
      'data: {"choices":[{"delta":{"reasoning_content":"hidden"},"finish_reason":null}]}',
      'data: [DONE]',
    ]);

    assert.equal(parts.length, 1);
    assert.ok(parts[0] instanceof LanguageModelDataPart);
    assert.equal((parts[0] as LanguageModelDataPart).mimeType, DEEPSEEK_REASONING_MIME);
    assert.equal(new TextDecoder().decode((parts[0] as LanguageModelDataPart).data), 'hidden');
  } finally {
    vscodeMock.LanguageModelThinkingPart = previousThinkingPart;
  }
});

test('flushes streamed tool call arguments at the end of the response', async () => {
  const parts = await collectStreamParts([
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"read_file","arguments":"{\\"path\\":"}}]},"finish_reason":null}]}',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"README.md\\"}"}}]},"finish_reason":null}]}',
    'data: [DONE]',
  ]);

  assert.equal(parts.length, 1);
  assert.ok(parts[0] instanceof LanguageModelToolCallPart);
  assert.equal((parts[0] as LanguageModelToolCallPart).callId, 'call-1');
  assert.equal((parts[0] as LanguageModelToolCallPart).name, 'read_file');
  assert.deepEqual((parts[0] as LanguageModelToolCallPart).input, { path: 'README.md' });
});

test('preserves Gemini tool call thought signatures as data parts', async () => {
  const parts = await collectStreamParts([
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"read_file","arguments":"{}"},"extra_content":{"google":{"thought_signature":"sig-1"}}}]},"finish_reason":null}]}',
    'data: [DONE]',
  ]);

  assert.equal(parts.length, 2);
  assert.ok(parts[0] instanceof LanguageModelDataPart);
  assert.equal(
    (parts[0] as LanguageModelDataPart).mimeType,
    GEMINI_THOUGHT_SIGNATURE_MIME
  );
  assert.deepEqual(
    JSON.parse(new TextDecoder().decode((parts[0] as LanguageModelDataPart).data)),
    {
      toolCallId: 'call-1',
      thoughtSignature: 'sig-1',
    }
  );
  assert.ok(parts[1] instanceof LanguageModelToolCallPart);
  assert.equal((parts[1] as LanguageModelToolCallPart).callId, 'call-1');
});

test('maps Gemini delta-level thought signatures to the first tool call in the chunk', async () => {
  const parts = await collectStreamParts([
    'data: {"choices":[{"delta":{"extra_content":{"google":{"thought_signature":"sig-1"}},"tool_calls":[{"index":0,"id":"call-1","function":{"name":"read_file","arguments":"{}"}}]},"finish_reason":null}]}',
    'data: [DONE]',
  ]);

  assert.equal(parts.length, 2);
  assert.ok(parts[0] instanceof LanguageModelDataPart);
  assert.deepEqual(
    JSON.parse(new TextDecoder().decode((parts[0] as LanguageModelDataPart).data)),
    {
      toolCallId: 'call-1',
      thoughtSignature: 'sig-1',
    }
  );
});
