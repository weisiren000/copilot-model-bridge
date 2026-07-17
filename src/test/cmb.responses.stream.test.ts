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

test('reports Responses usage for the context window widget', async () => {
  const reported: unknown[] = [];
  await consumeResponsesSSEStream(streamFrom([
    'event: response.completed',
    'data: {"type":"response.completed","response":{"usage":{"input_tokens":200,"output_tokens":40,"total_tokens":240,"input_tokens_details":{"cached_tokens":50},"output_tokens_details":{"reasoning_tokens":10}}}}',
    '',
  ]), { report: (part: unknown) => reported.push(part) } as never, neverCancelledToken as never);

  assert.equal(reported.length, 1);
  assert.equal((reported[0] as LanguageModelDataPart).mimeType, 'usage');
  assert.deepEqual(
    JSON.parse(new TextDecoder().decode((reported[0] as LanguageModelDataPart).data)),
    {
      prompt_tokens: 200,
      completion_tokens: 40,
      total_tokens: 240,
      prompt_tokens_details: { cached_tokens: 50 },
      completion_tokens_details: {
        reasoning_tokens: 10,
        accepted_prediction_tokens: 0,
        rejected_prediction_tokens: 0,
      },
    }
  );
});

test('preserves reasoning text deltas in a stable data part', async () => {
  const reported: unknown[] = [];
  await consumeResponsesSSEStream(streamFrom([
    'event: response.reasoning_text.delta',
    'data: {"type":"response.reasoning_text.delta","delta":"think"}',
    '',
    'event: response.output_text.delta',
    'data: {"type":"response.output_text.delta","delta":"answer"}',
    '',
  ]), { report: (part: unknown) => reported.push(part) } as never, neverCancelledToken as never);

  assert.equal((reported[0] as LanguageModelTextPart).value, 'answer');
  assert.equal((reported[1] as LanguageModelDataPart).mimeType, 'application/x-deepseek-reasoning');
  assert.equal(new TextDecoder().decode((reported[1] as LanguageModelDataPart).data), 'think');
});

test('preserves a final reasoning summary in a stable data part', async () => {
  const reported: unknown[] = [];
  await consumeResponsesSSEStream(streamFrom([
    'event: response.output_item.done',
    'data: {"type":"response.output_item.done","item_id":"rs_1","output_index":0,"item":{"type":"reasoning","id":"rs_1","summary":[{"type":"summary_text","text":"checked factors"}]}}',
    '',
    'event: response.output_text.delta',
    'data: {"type":"response.output_text.delta","delta":"answer"}',
    '',
  ]), { report: (part: unknown) => reported.push(part) } as never, neverCancelledToken as never);

  assert.equal((reported[0] as LanguageModelTextPart).value, 'answer');
  assert.equal(
    new TextDecoder().decode((reported[1] as LanguageModelDataPart).data),
    'checked factors'
  );
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

  const reasoningParts = reported.filter(part => part instanceof LanguageModelDataPart);
  assert.equal(reasoningParts.length, 1);
  assert.equal(
    new TextDecoder().decode((reasoningParts[0] as LanguageModelDataPart).data),
    'Preparing stash and inspecting conflicts'
  );
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

  const reasoningParts = reported.filter(part => part instanceof LanguageModelDataPart);
  assert.equal(reasoningParts.length, 1);
  assert.equal(
    new TextDecoder().decode((reasoningParts[0] as LanguageModelDataPart).data),
    'first second'
  );
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
