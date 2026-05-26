import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';

const vscodeMock = {
  LanguageModelChatMessageRole: { User: 1, Assistant: 2 },
  LanguageModelChatToolMode: { Required: 1 },
  LanguageModelDataPart: class LanguageModelDataPart {},
  LanguageModelTextPart: class LanguageModelTextPart {},
  LanguageModelToolCallPart: class LanguageModelToolCallPart {},
  LanguageModelToolResultPart: class LanguageModelToolResultPart {},
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

test('aggregate export keeps request headers and model catalog helpers', () => {
  const index = require('../provider/openaiCompatible') as Record<string, unknown>;

  assert.equal(typeof index.buildChatRequestHeaders, 'function');
  assert.equal(typeof index.fetchOpenAIModelList, 'function');
});
