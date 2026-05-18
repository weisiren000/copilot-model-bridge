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
      supportsEditTools: true,
      preferredEditTools: undefined,
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

test('defaults edit tools support to tool calling support', () => {
  const model = normalizeModelConfig({
    id: 'tools-model',
    name: 'Tools Model',
    supportsToolCalling: true,
  });

  assert.equal(model.supportsEditTools, true);
});

test('filters unknown configured edit tools during config normalization', () => {
  const model = normalizeModelConfig({
    id: 'edit-model',
    name: 'Edit Model',
    preferredEditTools: ['apply-patch', 'unknown', 'apply-patch', 'code-rewrite'] as never,
  });

  assert.deepEqual(model.preferredEditTools, ['apply-patch', 'code-rewrite']);
});

test('keeps explicitly invalid edit tool configuration empty instead of defaulting it', () => {
  const model = normalizeModelConfig({
    id: 'invalid-edit-model',
    name: 'Invalid Edit Model',
    preferredEditTools: ['unknown'] as never,
  });

  assert.deepEqual(model.preferredEditTools, []);
});

test('does not default edit tools support when tool calling is disabled', () => {
  const model = normalizeModelConfig({
    id: 'plain-model',
    name: 'Plain Model',
    supportsToolCalling: false,
  });

  assert.equal(model.supportsEditTools, false);
});

test('tool calling disabled overrides explicit edit tools support', () => {
  const model = normalizeModelConfig({
    id: 'no-tools-model',
    name: 'No Tools Model',
    supportsToolCalling: false,
    supportsEditTools: true,
  });

  assert.equal(model.supportsEditTools, false);
});
