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

test('derives a hashed prompt cache key from the stable GPT-5.6 request prefix', () => {
  const {
    buildResponsesRequestBody,
  } = require('../provider/openaiCompatible/responses/cmb.responses.request') as typeof import('../provider/openaiCompatible/responses/cmb.responses.request');
  const firstUserMessage = {
    type: 'message' as const,
    role: 'user' as const,
    content: [{ type: 'input_text' as const, text: 'private project question' }],
  };
  const common = {
    modelId: 'gpt-5.6-sol',
    instructions: 'Use the repository rules.',
    maxOutputTokens: 128000,
    toolOptions: {
      tools: [{ type: 'function', name: 'read_file', parameters: { type: 'object' } }],
    },
  };

  const firstBody = buildResponsesRequestBody({
    ...common,
    input: [firstUserMessage],
  });
  const laterBody = buildResponsesRequestBody({
    ...common,
    input: [
      firstUserMessage,
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'Earlier answer' }],
      },
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'Follow-up question' }],
      },
    ],
  });
  const differentConversation = buildResponsesRequestBody({
    ...common,
    input: [{
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: 'different private question' }],
    }],
  });

  assert.match(firstBody.prompt_cache_key as string, /^cmb_[A-Za-z0-9_-]{43}$/);
  assert.equal(laterBody.prompt_cache_key, firstBody.prompt_cache_key);
  assert.notEqual(differentConversation.prompt_cache_key, firstBody.prompt_cache_key);
  assert.doesNotMatch(firstBody.prompt_cache_key as string, /private project question/);
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
