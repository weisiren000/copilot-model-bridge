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

const openAICompatible = require('../provider/openaiCompatible') as Record<string, unknown>;

test('provides complete model profiles for the GPT-5.6 family', () => {
  assert.equal(typeof openAICompatible.getOpenAIModelProfile, 'function');
  const getProfile = openAICompatible.getOpenAIModelProfile as (
    providerBaseUrl: string,
    modelId: string
  ) => Record<string, unknown> | undefined;

  for (const modelId of ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']) {
    assert.deepEqual(getProfile('https://api.openai.com/v1', modelId), {
      id: modelId,
      name: modelId === 'gpt-5.6-sol'
        ? 'GPT-5.6 Sol'
        : modelId === 'gpt-5.6-terra'
          ? 'GPT-5.6 Terra'
          : 'GPT-5.6 Luna',
      family: 'gpt-5.6',
      maxInputTokens: 922000,
      maxOutputTokens: 128000,
      supportsToolCalling: true,
      supportsVision: true,
      supportsEditTools: true,
      supportsReasoning: true,
      supportedReasoningLevels: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
      defaultReasoningLevel: 'medium',
    });
  }

  assert.deepEqual(getProfile('https://api.openai.com/v1', 'gpt-5.6'), {
    id: 'gpt-5.6',
    name: 'GPT-5.6 (Sol alias)',
    family: 'gpt-5.6',
    maxInputTokens: 922000,
    maxOutputTokens: 128000,
    supportsToolCalling: true,
    supportsVision: true,
    supportsEditTools: true,
    supportsReasoning: true,
    supportedReasoningLevels: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    defaultReasoningLevel: 'medium',
  });

  assert.equal(
    getProfile('https://openrouter.ai/api/v1', 'gpt-5.6-sol'),
    undefined
  );
});

test('keeps GPT-5.6 Chat Completions reasoning enabled when function tools are present', () => {
  assert.equal(typeof openAICompatible.resolveOpenAIChatRequestPolicy, 'function');
  const resolvePolicy = openAICompatible.resolveOpenAIChatRequestPolicy as (
    options: Record<string, unknown>
  ) => Record<string, unknown>;

  assert.deepEqual(resolvePolicy({
    providerBaseUrl: 'https://api.openai.com/v1',
    modelId: 'gpt-5.6-sol',
    hasTools: true,
  }), {
    maxTokenField: 'max_completion_tokens',
  });

  assert.deepEqual(resolvePolicy({
    providerBaseUrl: 'https://api.openai.com/v1',
    modelId: 'gpt-5.6-terra',
    hasTools: true,
    reasoningEffort: 'medium',
  }), {
    maxTokenField: 'max_completion_tokens',
  });

  assert.deepEqual(resolvePolicy({
    providerBaseUrl: 'https://openrouter.ai/api/v1',
    modelId: 'openai/gpt-5.6-sol',
    hasTools: true,
    reasoningEffort: 'medium',
  }), {
    maxTokenField: 'max_tokens',
  });
});
