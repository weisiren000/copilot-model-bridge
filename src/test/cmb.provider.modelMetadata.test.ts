import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildModelMetadata,
  normalizeStatusIcon,
} from '../provider/model/cmb.provider.modelMetadata';

test('builds compact model metadata with provider and model ids in tooltip', () => {
  const metadata = buildModelMetadata({
    compoundId: 'openrouter::openai/gpt-4.1',
    provider: {
      id: 'openrouter',
      displayName: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
    },
    model: {
      id: 'openai/gpt-4.1',
      name: 'GPT-4.1',
      maxInputTokens: 128000,
      maxOutputTokens: 4096,
      supportsToolCalling: true,
      family: 'gpt-4.1',
      version: '2025-04-14',
    },
  });

  assert.equal(metadata.family, 'gpt-4.1');
  assert.equal(metadata.version, '2025-04-14');
  assert.equal(metadata.detail, 'OpenRouter · openai/gpt-4.1');
  assert.match(metadata.tooltip, /Provider: OpenRouter \(openrouter\)/);
  assert.match(metadata.tooltip, /Model: GPT-4\.1 \(openai\/gpt-4\.1\)/);
  assert.match(metadata.tooltip, /Base URL: https:\/\/openrouter\.ai\/api\/v1/);
});

test('infers model family from model id and omits category by default', () => {
  const metadata = buildModelMetadata({
    compoundId: 'local::meta-llama-3.1',
    provider: {
      id: 'local',
      displayName: 'Local',
      baseUrl: 'http://localhost:11434/v1',
    },
    model: {
      id: 'meta-llama-3.1',
      name: 'Llama',
      maxInputTokens: 32000,
      maxOutputTokens: 4096,
      supportsToolCalling: false,
    },
  });

  assert.equal(metadata.family, 'meta');
  assert.equal(metadata.version, '');
  assert.equal(metadata.category, undefined);
});

test('adds configured metadata category and safe status icon', () => {
  const metadata = buildModelMetadata({
    compoundId: 'provider::reasoner',
    provider: {
      id: 'provider',
      displayName: 'Provider',
      baseUrl: 'https://example.com/v1',
    },
    model: {
      id: 'reasoner',
      name: 'Reasoner',
      maxInputTokens: 64000,
      maxOutputTokens: 8192,
      supportsToolCalling: true,
      categoryLabel: 'Reasoning',
      categoryOrder: 10,
      statusIcon: 'sparkle',
    },
  });

  assert.deepEqual(metadata.category, { label: 'Reasoning', order: 10 });
  assert.equal(metadata.statusIcon, 'sparkle');
});

test('exposes VS Code input and output metadata', () => {
  const metadata = buildModelMetadata({
    compoundId: 'provider::long-context',
    provider: {
      id: 'provider',
      displayName: 'Provider',
      baseUrl: 'https://example.com/v1',
    },
    model: {
      id: 'long-context',
      name: 'Long Context',
      maxInputTokens: 393216,
      maxOutputTokens: 606784,
      supportsToolCalling: true,
    },
  });

  assert.equal(metadata.maxInputTokens, 393216);
  assert.equal(metadata.maxOutputTokens, 606784);
});

test('filters unsafe status icon ids', () => {
  assert.equal(normalizeStatusIcon('sparkle'), 'sparkle');
  assert.equal(normalizeStatusIcon('$(sparkle)'), undefined);
  assert.equal(normalizeStatusIcon('sparkle;bad'), undefined);
});
