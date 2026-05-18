import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOpenAIContent,
  buildModelCapabilities,
  buildModelBillingMetadata,
  buildModelReasoningConfigurationSchema,
  createOpenAIDataPartContent,
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

test('converts text data parts to OpenAI-compatible text content', () => {
  assert.deepEqual(
    createOpenAIDataPartContent(new TextEncoder().encode('hello attachment'), 'text/plain', {}),
    [{ type: 'text', text: 'hello attachment' }]
  );
});

test('converts JSON data parts to serialized text content', () => {
  assert.deepEqual(
    createOpenAIDataPartContent(new TextEncoder().encode('{"ok":true}'), 'application/json', {}),
    [{ type: 'text', text: '{"ok":true}' }]
  );
});

test('converts image data parts to OpenAI-compatible image content', () => {
  assert.deepEqual(
    createOpenAIDataPartContent(new Uint8Array([1, 2, 3]), 'image/png', {}),
    [{
      type: 'image_url',
      image_url: {
        url: 'data:image/png;base64,AQID',
      },
    }]
  );
});

test('rejects unsupported video data parts with a clear error', () => {
  assert.throws(
    () => createOpenAIDataPartContent(new Uint8Array([1]), 'video/mp4', { supportsVideo: false }),
    /Video attachments are not supported/
  );
});

test('rejects unknown binary data parts with a clear error', () => {
  assert.throws(
    () => createOpenAIDataPartContent(
      new Uint8Array([1]),
      'application/octet-stream',
      { supportsFileInput: false }
    ),
    /Unsupported attachment MIME type "application\/octet-stream"/
  );
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

test('adds default edit tools for tool-calling models', () => {
  assert.deepEqual(
    buildModelCapabilities({
      supportsToolCalling: true,
      supportsVision: false,
    }),
    {
      toolCalling: true,
      imageInput: false,
      editTools: ['find-replace', 'multi-find-replace', 'apply-patch'],
    }
  );
});

test('uses configured edit tools and filters unknown values', () => {
  assert.deepEqual(
    buildModelCapabilities({
      supportsToolCalling: true,
      supportsVision: true,
      supportsEditTools: true,
      preferredEditTools: ['code-rewrite', 'unknown', 'apply-patch', 'code-rewrite'] as never,
    }),
    {
      toolCalling: true,
      imageInput: true,
      editTools: ['code-rewrite', 'apply-patch'],
    }
  );
});

test('does not fall back to default edit tools when configured edit tools are all unknown', () => {
  assert.deepEqual(
    buildModelCapabilities({
      supportsToolCalling: true,
      supportsVision: false,
      supportsEditTools: true,
      preferredEditTools: ['unknown'] as never,
    }),
    {
      toolCalling: true,
      imageInput: false,
    }
  );
});

test('omits edit tools when tool calling is disabled', () => {
  assert.deepEqual(
    buildModelCapabilities({
      supportsToolCalling: false,
      supportsVision: false,
      supportsEditTools: true,
      preferredEditTools: ['apply-patch'],
    }),
    {
      toolCalling: false,
      imageInput: false,
    }
  );
});

test('omits edit tools when explicitly disabled', () => {
  assert.deepEqual(
    buildModelCapabilities({
      supportsToolCalling: true,
      supportsVision: false,
      supportsEditTools: false,
    }),
    {
      toolCalling: true,
      imageInput: false,
    }
  );
});

test('uses 0x default billing multiplier for BYOK models', () => {
  assert.deepEqual(buildModelBillingMetadata({}), {
    multiplier: '0x',
    multiplierNumeric: 0,
  });
});

test('derives numeric billing multiplier from x suffix labels', () => {
  assert.deepEqual(buildModelBillingMetadata({ multiplier: '1x' }), {
    multiplier: '1x',
    multiplierNumeric: 1,
  });

  assert.deepEqual(buildModelBillingMetadata({ multiplier: '0.5x' }), {
    multiplier: '0.5x',
    multiplierNumeric: 0.5,
  });
});

test('keeps non-numeric billing multiplier labels without numeric value', () => {
  assert.deepEqual(buildModelBillingMetadata({ multiplier: 'High' }), {
    multiplier: 'High',
  });
});

test('prefers explicit billing multiplier numeric value', () => {
  assert.deepEqual(buildModelBillingMetadata({ multiplier: '2x', multiplierNumeric: 3 }), {
    multiplier: '2x',
    multiplierNumeric: 3,
  });
});

test('ignores invalid billing multiplier numeric values', () => {
  assert.deepEqual(buildModelBillingMetadata({ multiplier: 'High', multiplierNumeric: -1 }), {
    multiplier: 'High',
  });

  assert.deepEqual(buildModelBillingMetadata({ multiplier: 'High', multiplierNumeric: Number.NaN }), {
    multiplier: 'High',
  });
});
