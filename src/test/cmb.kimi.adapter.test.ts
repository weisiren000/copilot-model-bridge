import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyKimiRequestPatch,
  getKimiModelKind,
  normalizeKimiReasoningModel,
} from '../provider/kimi/cmb.kimi.adapter';

test('recognizes supported Kimi thinking model ids without matching unrelated models', () => {
  assert.equal(getKimiModelKind('kimi-k3'), 'k3');
  assert.equal(getKimiModelKind('moonshot/kimi-k2.7-code-highspeed'), 'k2.7-code');
  assert.equal(getKimiModelKind('kimi-k2.6'), 'k2.6');
  assert.equal(getKimiModelKind('kimi-k2.5'), 'k2.5');
  assert.equal(getKimiModelKind('kimi-k2-instruct'), undefined);
});

test('normalizes fixed and configurable Kimi reasoning profiles', () => {
  assert.deepEqual(normalizeKimiReasoningModel({
    id: 'kimi-k3',
    supportsReasoning: false,
    supportedReasoningLevels: ['low', 'high'],
    defaultReasoningLevel: 'low',
  }), {
    id: 'kimi-k3',
    supportsReasoning: true,
    supportedReasoningLevels: ['max'],
    defaultReasoningLevel: 'max',
  });

  assert.deepEqual(normalizeKimiReasoningModel({
    id: 'kimi-k2.6',
    supportsReasoning: true,
    supportedReasoningLevels: ['medium', 'high'],
    defaultReasoningLevel: 'medium',
  }), {
    id: 'kimi-k2.6',
    supportsReasoning: true,
    supportedReasoningLevels: ['none', 'max'],
    defaultReasoningLevel: 'max',
  });
});

test('keeps Kimi K2.7 thinking history without unsupported request parameters', () => {
  const requestBody: Record<string, unknown> = {
    reasoning_effort: 'max',
    thinking: { type: 'enabled' },
    tool_choice: 'required',
    messages: [{
      role: 'assistant',
      content: null,
      __reasoningContent: 'inspect history',
    }],
  };

  applyKimiRequestPatch(requestBody, {
    modelId: 'kimi-k2.7-code',
    supportsReasoning: true,
    reasoningLevel: 'max',
  });

  assert.equal(requestBody.reasoning_effort, undefined);
  assert.equal(requestBody.thinking, undefined);
  assert.equal(requestBody.tool_choice, 'auto');
  assert.deepEqual(requestBody.messages, [{
    role: 'assistant',
    content: null,
    reasoning_content: 'inspect history',
  }]);
});

test('does not replay preserved thinking for Kimi K2.5', () => {
  const requestBody: Record<string, unknown> = {
    reasoning_effort: 'high',
    messages: [{
      role: 'assistant',
      content: 'answer',
      __reasoningContent: 'private trace',
    }],
  };

  applyKimiRequestPatch(requestBody, {
    modelId: 'kimi-k2.5',
    supportsReasoning: true,
    reasoningLevel: 'max',
  });

  assert.equal(requestBody.reasoning_effort, undefined);
  assert.deepEqual(requestBody.thinking, { type: 'enabled' });
  assert.deepEqual(requestBody.messages, [{
    role: 'assistant',
    content: 'answer',
  }]);
});
