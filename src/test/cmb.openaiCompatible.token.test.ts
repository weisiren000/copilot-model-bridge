import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateChatMessageTokens,
  estimateStringTokens,
} from '../provider/openaiCompatible/cmb.openaiCompatible.token';

test('estimates string tokens with the text heuristic', () => {
  assert.equal(estimateStringTokens('123456789'), 3);
});

test('estimates text message parts with the text heuristic', () => {
  assert.equal(estimateChatMessageTokens([
    { type: 'text', text: '12345678' },
  ]), 2);
});

test('adds fixed token cost for image parts', () => {
  assert.equal(estimateChatMessageTokens([
    { type: 'image', byteLength: 128 },
  ]), 1024);
});

test('estimates JSON and plain text data parts as decoded text', () => {
  assert.equal(estimateChatMessageTokens([
    { type: 'data', mimeType: 'application/json', data: new TextEncoder().encode('{"ok":true}') },
    { type: 'data', mimeType: 'text/plain', data: new TextEncoder().encode('hello') },
  ]), 5);
});

test('does not count Copilot usage metadata as model input', () => {
  assert.equal(estimateChatMessageTokens([{
    type: 'data',
    mimeType: 'usage',
    data: new TextEncoder().encode('{"prompt_tokens":10}'),
  }]), 0);
});

test('estimates tool calls from name and serialized input', () => {
  assert.equal(estimateChatMessageTokens([
    { type: 'toolCall', name: 'read_file', input: { path: 'README.md' } },
  ]), 8);
});

test('estimates tool results from nested text and data content', () => {
  assert.equal(estimateChatMessageTokens([
    {
      type: 'toolResult',
      callId: 'call_12345678',
      content: [
        { type: 'text', text: 'result text' },
        { type: 'data', mimeType: 'application/json', data: new TextEncoder().encode('{"value":1}') },
      ],
    },
  ]), 10);
});

test('estimates mixed messages without ignoring non-text parts', () => {
  assert.equal(estimateChatMessageTokens([
    { type: 'text', text: 'look' },
    { type: 'image', byteLength: 256 },
    { type: 'toolCall', name: 'edit', input: { ok: true } },
  ]), 1029);
});
