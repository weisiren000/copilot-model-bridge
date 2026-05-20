import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModelSummary } from '../management/cmb.management.summary';
import { ModelConfig } from '../types';

test('summarizes input and output token limits', () => {
  const model: ModelConfig = {
    id: 'long-context',
    name: 'Long Context',
    maxInputTokens: 1500000,
    maxOutputTokens: 4096,
    supportsToolCalling: true,
  };

  const summary = buildModelSummary(model);

  assert.match(summary, /Input: 1,500,000 tokens/);
  assert.match(summary, /Output: 4,096 tokens/);
});

test('does not include context window in model summary', () => {
  const model: ModelConfig = {
    id: 'legacy-model',
    name: 'Legacy Model',
    maxInputTokens: 1000000,
    maxOutputTokens: 4096,
    supportsToolCalling: true,
  };

  const summary = buildModelSummary(model);

  assert.doesNotMatch(summary, /Context:/);
  assert.match(summary, /Input: 1,000,000 tokens/);
  assert.match(summary, /Output: 4,096 tokens/);
});
