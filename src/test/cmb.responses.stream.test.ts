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
  constructor(readonly value: string, readonly id?: string) {}
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
const {
  normalizeThinkingText,
} = require('../provider/openaiCompatible/chatCompletions/cmb.chatCompletions.stream') as typeof import('../provider/openaiCompatible/chatCompletions/cmb.chatCompletions.stream');

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

test('reports reasoning summary from final output item as thinking part', async () => {
  const reported: unknown[] = [];
  await consumeResponsesSSEStream(streamFrom([
    'event: response.output_item.done',
    'data: {"type":"response.output_item.done","item_id":"rs_1","output_index":0,"item":{"type":"reasoning","id":"rs_1","summary":[{"type":"summary_text","text":"checked factors"}]}}',
    '',
    'event: response.output_text.delta',
    'data: {"type":"response.output_text.delta","delta":"answer"}',
    '',
  ]), { report: (part: unknown) => reported.push(part) } as never, neverCancelledToken as never);

  assert.equal(reported[0] instanceof LanguageModelThinkingPart, true);
  assert.equal((reported[0] as LanguageModelThinkingPart).value, 'checked factors');
  assert.equal((reported[1] as LanguageModelTextPart).value, 'answer');
});

test('reports a reasoning item once and prefers its final summary', async () => {
  const reported: unknown[] = [];
  await consumeResponsesSSEStream(streamFrom([
    'event: response.reasoning_summary_text.delta',
    'data: {"type":"response.reasoning_summary_text.delta","item_id":"rs_1","output_index":0,"delta":"**Preparing stash"}',
    '',
    'event: response.reasoning_summary_text.delta',
    'data: {"type":"response.reasoning_summary_text.delta","item_id":"rs_1","output_index":0,"delta":" and inspecting conflicts**"}',
    '',
    'event: response.output_item.done',
    'data: {"type":"response.output_item.done","item_id":"rs_1","output_index":0,"item":{"type":"reasoning","id":"rs_1","summary":[{"type":"summary_text","text":"<!-- -->**Preparing stash and inspecting conflicts**"}]}}',
    '',
  ]), { report: (part: unknown) => reported.push(part) } as never, neverCancelledToken as never);

  const thinkingParts = reported.filter(part => part instanceof LanguageModelThinkingPart);
  assert.equal(thinkingParts.length, 1);
  assert.equal(
    (thinkingParts[0] as LanguageModelThinkingPart).value,
    'Preparing stash and inspecting conflicts'
  );
  assert.equal((thinkingParts[0] as LanguageModelThinkingPart).id, 'rs_1');
});

test('removes paired strong markers from thinking text without deleting ordinary asterisks', () => {
  const value = [
    '<!-- -->**Planning code review steps**',
    '**Determining efficient git commands**',
    'Keep *single* markers and 2 ** 3',
  ].join('\n');

  assert.equal(
    normalizeThinkingText(value),
    [
      'Planning code review steps',
      'Determining efficient git commands',
      'Keep *single* markers and 2 ** 3',
    ].join('\n')
  );
});

test('flushes streamed reasoning once when no final summary arrives', async () => {
  const reported: unknown[] = [];
  await consumeResponsesSSEStream(streamFrom([
    'event: response.reasoning_text.delta',
    'data: {"type":"response.reasoning_text.delta","item_id":"rs_2","delta":"first "}',
    '',
    'event: response.reasoning_text.delta',
    'data: {"type":"response.reasoning_text.delta","item_id":"rs_2","delta":"second"}',
    '',
  ]), { report: (part: unknown) => reported.push(part) } as never, neverCancelledToken as never);

  const thinkingParts = reported.filter(part => part instanceof LanguageModelThinkingPart);
  assert.equal(thinkingParts.length, 1);
  assert.equal((thinkingParts[0] as LanguageModelThinkingPart).value, 'first second');
  assert.equal((thinkingParts[0] as LanguageModelThinkingPart).id, 'rs_2');
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

test('reports overloaded stream failures as friendly upstream errors', async () => {
  await assert.rejects(
    consumeResponsesSSEStream(streamFrom([
      'event: response.failed',
      'data: {"type":"response.failed","error":{"message":"Our servers are currently overloaded. Please try again later."}}',
      '',
    ]), { report() {} } as never, neverCancelledToken as never),
    /上游模型服务当前繁忙，请稍后重试。/
  );
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
