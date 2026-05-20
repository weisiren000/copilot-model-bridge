import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOpenAIContent,
  createOpenAIDataPartContent,
  createOpenAIImagePart,
} from '../provider/openaiCompatible/cmb.openaiCompatible.content';

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

test('ignores Copilot cache control data parts instead of treating them as file attachments', () => {
  assert.deepEqual(
    createOpenAIDataPartContent(new TextEncoder().encode('ephemeral'), 'cache_control', {}),
    []
  );
});

test('ignores Copilot state metadata data parts instead of treating them as file attachments', () => {
  for (const mimeType of [
    'stateful_marker',
    'thinking',
    'context_management',
    'phase_data',
    'response_output_message_id',
  ]) {
    assert.deepEqual(createOpenAIDataPartContent(new Uint8Array([1]), mimeType, {}), []);
  }
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
