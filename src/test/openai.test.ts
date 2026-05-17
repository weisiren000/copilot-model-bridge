import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOpenAIContent,
  buildReasoningConfigurationSchema,
  createOpenAIImagePart,
  resolveReasoningLevel,
} from '../openai';

test('converts image bytes to OpenAI-compatible data URL content', () => {
  assert.deepEqual(createOpenAIImagePart(new Uint8Array([1, 2, 3]), 'image/png'), {
    type: 'image_url',
    image_url: {
      url: 'data:image/png;base64,AQID',
    },
  });
});

test('keeps text and image parts together for multimodal messages', () => {
  const image = createOpenAIImagePart(new Uint8Array([255]), 'image/jpeg');

  assert.deepEqual(buildOpenAIContent('look at this', [image]), [
    { type: 'text', text: 'look at this' },
    {
      type: 'image_url',
      image_url: {
        url: 'data:image/jpeg;base64,/w==',
      },
    },
  ]);
});

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
