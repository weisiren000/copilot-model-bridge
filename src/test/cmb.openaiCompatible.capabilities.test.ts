import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildModelCapabilities,
  resolveToolChoice,
} from '../provider/openaiCompatible/cmb.openaiCompatible.capabilities';

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

test('maps auto tool mode to OpenAI auto tool choice when tools exist', () => {
  assert.equal(resolveToolChoice({
    hasTools: true,
    requestedToolMode: 'auto',
  }), 'auto');
});

test('maps required tool mode to required when model supports it', () => {
  assert.equal(resolveToolChoice({
    hasTools: true,
    requestedToolMode: 'required',
  }), 'required');
});

test('falls back to auto for required tool mode when configured', () => {
  assert.equal(resolveToolChoice({
    hasTools: true,
    requestedToolMode: 'required',
    toolChoiceMode: 'auto',
  }), 'auto');
});

test('omits tool choice when backend does not support the field', () => {
  assert.equal(resolveToolChoice({
    hasTools: true,
    requestedToolMode: 'required',
    toolChoiceMode: 'omit',
  }), undefined);
});

test('does not send tool choice when no tools are available', () => {
  assert.equal(resolveToolChoice({
    hasTools: false,
    requestedToolMode: 'required',
  }), undefined);
});
