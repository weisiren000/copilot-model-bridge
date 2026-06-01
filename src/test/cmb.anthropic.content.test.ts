import test from 'node:test';
import assert from 'node:assert/strict';

test('converts image bytes to Anthropic image content blocks', () => {
  const {
    createAnthropicDataPartContent,
  } = require('../provider/anthropic/cmb.anthropic.content') as typeof import('../provider/anthropic/cmb.anthropic.content');

  assert.deepEqual(
    createAnthropicDataPartContent(new Uint8Array([1, 2, 3]), 'image/png', {}),
    [{
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: 'AQID',
      },
    }]
  );
});

test('converts PDF bytes to Anthropic document content blocks', () => {
  const {
    createAnthropicDataPartContent,
  } = require('../provider/anthropic/cmb.anthropic.content') as typeof import('../provider/anthropic/cmb.anthropic.content');

  assert.deepEqual(
    createAnthropicDataPartContent(new Uint8Array([37, 80, 68, 70]), 'application/pdf', {
      enableDocumentCitations: true,
    }),
    [{
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: 'JVBERg==',
      },
      citations: { enabled: true },
    }]
  );
});

test('converts text attachments to Anthropic document blocks', () => {
  const {
    createAnthropicDataPartContent,
  } = require('../provider/anthropic/cmb.anthropic.content') as typeof import('../provider/anthropic/cmb.anthropic.content');

  assert.deepEqual(
    createAnthropicDataPartContent(new TextEncoder().encode('notes'), 'text/plain', {}),
    [{
      type: 'document',
      source: {
        type: 'text',
        media_type: 'text/plain',
        data: 'notes',
      },
    }]
  );
});

test('rejects audio and video attachments with clear Anthropic API errors', () => {
  const {
    createAnthropicDataPartContent,
  } = require('../provider/anthropic/cmb.anthropic.content') as typeof import('../provider/anthropic/cmb.anthropic.content');

  assert.throws(
    () => createAnthropicDataPartContent(new Uint8Array([1]), 'video/mp4', { supportsVideo: true }),
    /Video attachments are not supported by Anthropic Messages API/
  );
  assert.throws(
    () => createAnthropicDataPartContent(new Uint8Array([1]), 'audio/mpeg', {}),
    /Audio attachments are not supported by Anthropic Messages API/
  );
});
