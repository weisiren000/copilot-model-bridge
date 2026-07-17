import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import { DEEPSEEK_REASONING_MIME } from '../provider/deepseek/cmb.deepseek.adapter';

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
  LanguageModelDataPart,
  LanguageModelTextPart,
  LanguageModelThinkingPart,
  LanguageModelToolCallPart,
};

const moduleLoader = Module as unknown as {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
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
  ANTHROPIC_CITATION_MIME,
  ANTHROPIC_MESSAGE_METADATA_MIME,
  ANTHROPIC_REDACTED_THINKING_MIME,
  ANTHROPIC_THINKING_SIGNATURE_MIME,
  ANTHROPIC_USAGE_MIME,
  consumeAnthropicSSEStream,
} = require('../provider/anthropic/cmb.anthropic.stream') as typeof import('../provider/anthropic/cmb.anthropic.stream');

const neverCancelledToken = {
  isCancellationRequested: false,
  onCancellationRequested: () => ({ dispose() {} }),
};

test('reports Anthropic text deltas', async () => {
  const reported: unknown[] = [];
  await consumeAnthropicSSEStream(streamFrom([
    'event: content_block_delta',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
    '',
    'event: message_stop',
    'data: {"type":"message_stop"}',
    '',
  ]), { report: (part: unknown) => reported.push(part) } as never, neverCancelledToken as never);

  assert.equal(reported[0] instanceof LanguageModelTextPart, true);
  assert.equal((reported[0] as LanguageModelTextPart).value, 'Hello');
});

test('reports Anthropic streamed tool use blocks', async () => {
  const reported: unknown[] = [];
  await consumeAnthropicSSEStream(streamFrom([
    'event: content_block_start',
    'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"read_file","input":{}}}',
    '',
    'event: content_block_delta',
    'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\":"}}',
    '',
    'event: content_block_delta',
    'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\\"README.md\\"}"}}',
    '',
    'event: content_block_stop',
    'data: {"type":"content_block_stop","index":1}',
    '',
  ]), { report: (part: unknown) => reported.push(part) } as never, neverCancelledToken as never);

  assert.equal(reported[0] instanceof LanguageModelToolCallPart, true);
  assert.equal((reported[0] as LanguageModelToolCallPart).callId, 'toolu_1');
  assert.equal((reported[0] as LanguageModelToolCallPart).name, 'read_file');
  assert.deepEqual((reported[0] as LanguageModelToolCallPart).input, { path: 'README.md' });
});

test('preserves thinking deltas and signatures with stable data parts', async () => {
  const reported: unknown[] = [];
  await consumeAnthropicSSEStream(streamFrom([
    'event: content_block_delta',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"plan"}}',
    '',
    'event: content_block_delta',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"sig-1"}}',
    '',
  ]), { report: (part: unknown) => reported.push(part) } as never, neverCancelledToken as never);

  assert.equal(reported[0] instanceof LanguageModelDataPart, true);
  assert.equal((reported[0] as LanguageModelDataPart).mimeType, DEEPSEEK_REASONING_MIME);
  assert.equal(new TextDecoder().decode((reported[0] as LanguageModelDataPart).data), 'plan');
  assert.equal(reported[1] instanceof LanguageModelDataPart, true);
  assert.equal((reported[1] as LanguageModelDataPart).mimeType, ANTHROPIC_THINKING_SIGNATURE_MIME);
  assert.deepEqual(JSON.parse(new TextDecoder().decode((reported[1] as LanguageModelDataPart).data)), {
    index: 0,
    signature: 'sig-1',
  });
});

test('reports Anthropic message metadata and usage events as data parts', async () => {
  const reported: unknown[] = [];
  await consumeAnthropicSSEStream(streamFrom([
    'event: message_start',
    'data: {"type":"message_start","message":{"id":"msg_1","model":"claude-sonnet","usage":{"input_tokens":10,"output_tokens":1,"cache_read_input_tokens":4,"cache_creation_input_tokens":2}}}',
    '',
    'event: message_delta',
    'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":20}}',
    '',
  ]), { report: (part: unknown) => reported.push(part) } as never, neverCancelledToken as never);

  assert.equal((reported[0] as LanguageModelDataPart).mimeType, ANTHROPIC_MESSAGE_METADATA_MIME);
  assert.deepEqual(JSON.parse(new TextDecoder().decode((reported[0] as LanguageModelDataPart).data)), {
    id: 'msg_1',
    model: 'claude-sonnet',
  });
  assert.equal((reported[1] as LanguageModelDataPart).mimeType, ANTHROPIC_USAGE_MIME);
  assert.deepEqual(JSON.parse(new TextDecoder().decode((reported[1] as LanguageModelDataPart).data)), {
    input_tokens: 10,
    output_tokens: 1,
    cache_read_input_tokens: 4,
    cache_creation_input_tokens: 2,
  });
  assert.equal((reported[2] as LanguageModelDataPart).mimeType, ANTHROPIC_USAGE_MIME);
  assert.deepEqual(JSON.parse(new TextDecoder().decode((reported[2] as LanguageModelDataPart).data)), {
    output_tokens: 20,
  });
  assert.equal((reported[3] as LanguageModelDataPart).mimeType, 'usage');
  assert.deepEqual(JSON.parse(new TextDecoder().decode((reported[3] as LanguageModelDataPart).data)), {
    prompt_tokens: 16,
    completion_tokens: 20,
    total_tokens: 36,
    prompt_tokens_details: {
      cached_tokens: 4,
      cache_creation_input_tokens: 2,
    },
  });
});

test('preserves redacted thinking blocks and citation deltas as data parts', async () => {
  const reported: unknown[] = [];
  await consumeAnthropicSSEStream(streamFrom([
    'event: content_block_start',
    'data: {"type":"content_block_start","index":0,"content_block":{"type":"redacted_thinking","data":"opaque"}}',
    '',
    'event: content_block_delta',
    'data: {"type":"content_block_delta","index":1,"delta":{"type":"citations_delta","citation":{"type":"page_location","document_index":0,"start_page_number":2,"end_page_number":3}}}',
    '',
  ]), { report: (part: unknown) => reported.push(part) } as never, neverCancelledToken as never);

  assert.equal((reported[0] as LanguageModelDataPart).mimeType, ANTHROPIC_REDACTED_THINKING_MIME);
  assert.deepEqual(JSON.parse(new TextDecoder().decode((reported[0] as LanguageModelDataPart).data)), {
    data: 'opaque',
  });
  assert.equal((reported[1] as LanguageModelDataPart).mimeType, ANTHROPIC_CITATION_MIME);
  assert.deepEqual(JSON.parse(new TextDecoder().decode((reported[1] as LanguageModelDataPart).data)), {
    index: 1,
    citation: {
      type: 'page_location',
      document_index: 0,
      start_page_number: 2,
      end_page_number: 3,
    },
  });
});

test('keeps Anthropic stream error type and request id in thrown error message', async () => {
  await assert.rejects(
    consumeAnthropicSSEStream(streamFrom([
      'event: error',
      'data: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded","request_id":"req_1"}}',
      '',
    ]), { report() {} } as never, neverCancelledToken as never),
    /overloaded_error.*req_1.*Overloaded/
  );
});

function streamFrom(lines: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`${lines.join('\n')}\n`));
      controller.close();
    },
  });
}
