import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildModelReasoningConfigurationSchema,
  buildReasoningConfigurationSchema,
  resolveReasoningLevel,
} from '../provider/openaiCompatible/cmb.openaiCompatible.reasoning';

test('prefers official modelConfiguration reasoningEffort over legacy options', () => {
  assert.equal(
    resolveReasoningLevel(
      { reasoning_effort: 'low' },
      { reasoningEffort: 'high' },
      'medium'
    ),
    'high'
  );
});

test('builds Copilot-style thinking effort schema for model picker', () => {
  assert.deepEqual(buildReasoningConfigurationSchema('medium'), {
    properties: {
      reasoningEffort: {
        type: 'string',
        title: 'Thinking Effort',
        enum: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        enumItemLabels: ['None', 'Low', 'Medium', 'High', 'Xhigh', 'Max'],
        enumDescriptions: [
          'No reasoning applied',
          'Faster responses with less reasoning',
          'Balanced reasoning and speed',
          'Greater reasoning depth but slower',
          'Maximum reasoning depth but slower',
          'Maximum available reasoning depth',
        ],
        default: 'medium',
        group: 'navigation',
      },
    },
  });
});

test('limits thinking effort schema to model-supported levels', () => {
  assert.deepEqual(buildReasoningConfigurationSchema('medium', ['low', 'medium', 'high']), {
    properties: {
      reasoningEffort: {
        type: 'string',
        title: 'Thinking Effort',
        enum: ['low', 'medium', 'high'],
        enumItemLabels: ['Low', 'Medium', 'High'],
        enumDescriptions: [
          'Faster responses with less reasoning',
          'Balanced reasoning and speed',
          'Greater reasoning depth but slower',
        ],
        default: 'medium',
        group: 'navigation',
      },
    },
  });
});

test('falls back to model default when requested reasoning effort is unsupported', () => {
  assert.equal(
    resolveReasoningLevel(
      { reasoningEffort: 'high' },
      { reasoningEffort: 'max' },
      'medium',
      ['low', 'medium']
    ),
    'medium'
  );
});

test('omits thinking effort schema for non-reasoning models', () => {
  assert.equal(
    buildModelReasoningConfigurationSchema({
      supportsReasoning: false,
      defaultReasoningLevel: 'medium',
    }),
    undefined
  );
});

test('returns thinking effort schema for reasoning models', () => {
  const schema = buildModelReasoningConfigurationSchema({
    supportsReasoning: true,
    supportedReasoningLevels: ['low', 'medium'],
    defaultReasoningLevel: 'medium',
  });

  assert.deepEqual(schema, {
    properties: {
      reasoningEffort: {
        type: 'string',
        title: 'Thinking Effort',
        enum: ['low', 'medium'],
        enumItemLabels: ['Low', 'Medium'],
        enumDescriptions: [
          'Faster responses with less reasoning',
          'Balanced reasoning and speed',
        ],
        default: 'medium',
        group: 'navigation',
      },
    },
  });
});

test('limits thinking effort schema to default when supported levels are missing', () => {
  const schema = buildModelReasoningConfigurationSchema({
    supportsReasoning: true,
    defaultReasoningLevel: 'medium',
  });

  assert.deepEqual(schema, {
    properties: {
      reasoningEffort: {
        type: 'string',
        title: 'Thinking Effort',
        enum: ['medium'],
        enumItemLabels: ['Medium'],
        enumDescriptions: ['Balanced reasoning and speed'],
        default: 'medium',
        group: 'navigation',
      },
    },
  });
});

test('does not add max tokens to reasoning configuration schema', () => {
  const schema = buildModelReasoningConfigurationSchema({
    supportsReasoning: true,
    defaultReasoningLevel: 'medium',
  }) as { properties?: Record<string, unknown> };

  assert.equal(schema.properties?.maxTokens, undefined);
});
