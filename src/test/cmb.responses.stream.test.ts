import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';

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
  consumeResponsesSSEStream,
} = require('../provider/openaiCompatible/responses/cmb.responses.stream') as typeof import('../provider/openaiCompatible/responses/cmb.responses.stream');

const neverCancelledToken = {
  isCancellationRequested: false,
  onCancellationRequested: () => ({ dispose() {} }),
};

test('reports output text deltas', async () => {
  const reported: unknown[] = [];
  await consumeResponsesSSEStream(streamFrom([
    'event: response.output_text.delta',
    'data: {"type":"response.output_text.delta","delta":"Hello"}',
    '',
    'event: response.completed',
    'data: {"type":"response.completed"}',
    '',
  ]), { report: (part: unknown) => reported.push(part) } as never, neverCancelledToken as never);

  assert.deepEqual(reported.map(part => (part as { value: string }).value), ['Hello']);
});

test('reports reasoning text deltas as thinking parts', async () => {
  const reported: unknown[] = [];
  await consumeResponsesSSEStream(streamFrom([
    'event: response.reasoning_text.delta',
    'data: {"type":"response.reasoning_text.delta","delta":"think"}',
    '',
    'event: response.output_text.delta',
    'data: {"type":"response.output_text.delta","delta":"answer"}',
    '',
  ]), { report: (part: unknown) => reported.push(part) } as never, neverCancelledToken as never);

  assert.equal(reported[0] instanceof LanguageModelThinkingPart, true);
  assert.equal((reported[0] as LanguageModelThinkingPart).value, 'think');
  assert.equal((reported[1] as LanguageModelTextPart).value, 'answer');
});

test('reports final frame when stream ends without trailing blank line', async () => {
  const reported: unknown[] = [];
  await consumeResponsesSSEStream(streamFrom([
    'event: response.output_text.delta',
    'data: {"type":"response.output_text.delta","delta":"Tail"}',
  ], false), { report: (part: unknown) => reported.push(part) } as never, neverCancelledToken as never);

  assert.deepEqual(reported.map(part => (part as { value: string }).value), ['Tail']);
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
  ]), { report: (part: unknown) => reported.push(part) } as never, neverCancelledToken as never);

  assert.equal((reported[0] as { callId: string }).callId, 'call-1');
  assert.equal((reported[0] as { name: string }).name, 'read_file');
  assert.deepEqual((reported[0] as { input: unknown }).input, { path: 'README.md' });
});

function streamFrom(lines: string[], appendNewline = true): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      const suffix = appendNewline ? '\n' : '';
      controller.enqueue(new TextEncoder().encode(`${lines.join('\n')}${suffix}`));
      controller.close();
    },
  });
}
