import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelConfig } from '../modelConfig';

test('does not add a default reasoning level to non-reasoning models', () => {
  assert.deepEqual(
    normalizeModelConfig({
      id: 'gpt-4.1',
      name: 'GPT-4.1',
      supportsToolCalling: true,
    }),
    {
      id: 'gpt-4.1',
      name: 'GPT-4.1',
      maxInputTokens: 128000,
      maxOutputTokens: 4096,
      supportsToolCalling: true,
      supportsVision: false,
      supportsReasoning: false,
      supportedReasoningLevels: undefined,
      defaultReasoningLevel: undefined,
    }
  );
});

test('treats legacy defaultReasoningLevel as reasoning support', () => {
  assert.equal(
    normalizeModelConfig({
      id: 'legacy-reasoner',
      name: 'Legacy Reasoner',
      defaultReasoningLevel: 'high',
    }).supportsReasoning,
    true
  );
});

test('honors explicit supportsReasoning false over legacy defaultReasoningLevel', () => {
  const model = normalizeModelConfig({
    id: 'plain-model',
    name: 'Plain Model',
    supportsReasoning: false,
    defaultReasoningLevel: 'high',
  });

  assert.equal(model.supportsReasoning, false);
  assert.equal(model.defaultReasoningLevel, undefined);
});

test('keeps invalid configured reasoning levels from expanding to all levels', () => {
  assert.deepEqual(
    normalizeModelConfig({
      id: 'reasoner',
      name: 'Reasoner',
      supportsReasoning: true,
      supportedReasoningLevels: ['invalid'] as never,
      defaultReasoningLevel: 'high',
    }).supportedReasoningLevels,
    ['high']
  );
});
