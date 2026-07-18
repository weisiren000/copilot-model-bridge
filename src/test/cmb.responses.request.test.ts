import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';

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
    return { LanguageModelChatToolMode: { Required: 1 } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

test('builds Responses request body with max_output_tokens and reasoning summary', () => {
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
    store: false,
    max_output_tokens: 123,
    reasoning: { effort: 'medium', summary: 'auto' },
  });
});

test('sends explicit none reasoning effort instead of falling back to the model default', () => {
  const {
    buildResponsesRequestBody,
  } = require('../provider/openaiCompatible/responses/cmb.responses.request') as typeof import('../provider/openaiCompatible/responses/cmb.responses.request');

  const body = buildResponsesRequestBody({
    modelId: 'gpt-5.6-sol',
    input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hello' }] }],
    maxOutputTokens: 128000,
    reasoningEffort: 'none',
    toolOptions: {},
  });

  assert.deepEqual(body.reasoning, { effort: 'none' });
});

test('adds an empty object schema for Responses tools without input parameters', () => {
  const {
    buildResponsesToolOptions,
  } = require('../provider/openaiCompatible/responses/cmb.responses.tools') as typeof import('../provider/openaiCompatible/responses/cmb.responses.tools');

  const result = buildResponsesToolOptions({
    tools: [{
      name: 'terminal_last_command',
      description: 'Get the last terminal command',
    }],
  } as never, undefined);

  assert.deepEqual(result.tools, [{
    type: 'function',
    name: 'terminal_last_command',
    description: 'Get the last terminal command',
    parameters: {
      type: 'object',
      properties: {},
    },
  }]);
});
