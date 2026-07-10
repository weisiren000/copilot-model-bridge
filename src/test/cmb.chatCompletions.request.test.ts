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

const {
  buildChatRequestBody,
} = require('../provider/openaiCompatible/chatCompletions/cmb.chatCompletions.request') as typeof import('../provider/openaiCompatible/chatCompletions/cmb.chatCompletions.request');

test('sends GPT-5.6 reasoning and function tools together through Chat Completions', () => {
  const body = buildChatRequestBody({
    modelId: 'gpt-5.6-sol',
    messages: [{ role: 'user', content: 'hello' }],
    maxOutputTokens: 128000,
    responseOptions: {
      tools: [{
        name: 'read_file',
        description: 'Read a file',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
      }],
    },
    maxTokenField: 'max_completion_tokens',
    reasoningEffortOverride: 'medium',
  } as never);

  assert.equal(body.max_completion_tokens, 128000);
  assert.equal(body.max_tokens, undefined);
  assert.equal(body.reasoning_effort, 'medium');
  assert.deepEqual(body.tools, [{
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a file',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  }]);
});
