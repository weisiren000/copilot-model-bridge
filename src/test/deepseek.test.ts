import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyReasoningContentReplay,
  buildDeepSeekRequestPatch,
  decodeReasoningDataPart,
  DEEPSEEK_REASONING_MIME,
  isDeepSeekBaseUrl,
  isDeepSeekModelId,
  isDeepSeekRequest,
  mapToDeepSeekEffort,
} from '../deepseek';

test('detects DeepSeek baseUrl by hostname', () => {
  assert.equal(isDeepSeekBaseUrl('https://api.deepseek.com/v1'), true);
  assert.equal(isDeepSeekBaseUrl('https://api.deepseek.com'), true);
  assert.equal(isDeepSeekBaseUrl('https://platform.deepseek.com/api'), true);
  assert.equal(isDeepSeekBaseUrl('https://api.openai.com/v1'), false);
  assert.equal(isDeepSeekBaseUrl('not a url'), false);
});

test('detects DeepSeek model id by prefix and reasoner suffix', () => {
  assert.equal(isDeepSeekModelId('deepseek-v4-pro'), true);
  assert.equal(isDeepSeekModelId('deepseek-reasoner'), true);
  assert.equal(isDeepSeekModelId('vendor/deepseek-v4-flash'), true);
  assert.equal(isDeepSeekModelId('something-else-reasoner'), true);
  assert.equal(isDeepSeekModelId('gpt-4o'), false);
});

test('isDeepSeekRequest combines baseUrl and model heuristics', () => {
  assert.equal(
    isDeepSeekRequest({ baseUrl: 'https://api.deepseek.com/v1' }, 'gpt-4o'),
    true,
    'baseUrl alone is enough'
  );
  assert.equal(
    isDeepSeekRequest({ baseUrl: 'https://api.openai.com/v1' }, 'deepseek-v4-pro'),
    true,
    'model id alone is enough'
  );
  assert.equal(
    isDeepSeekRequest({ baseUrl: 'https://api.openai.com/v1' }, 'gpt-4o'),
    false
  );
});

test('mapToDeepSeekEffort restricts to high or max only', () => {
  assert.equal(mapToDeepSeekEffort('none'), 'high');
  assert.equal(mapToDeepSeekEffort('low'), 'high');
  assert.equal(mapToDeepSeekEffort('medium'), 'high');
  assert.equal(mapToDeepSeekEffort('high'), 'high');
  assert.equal(mapToDeepSeekEffort('xhigh'), 'max');
  assert.equal(mapToDeepSeekEffort('max'), 'max');
  assert.equal(mapToDeepSeekEffort(undefined), 'high');
});

test('disables thinking for non-reasoning models', () => {
  const patch = buildDeepSeekRequestPatch({
    supportsReasoning: false,
    hasTools: false,
  });
  assert.deepEqual(patch.thinking, { type: 'disabled' });
  assert.equal(patch.reasoning_effort, undefined);
});

test('enables thinking with mapped effort when reasoning is supported and no tools', () => {
  const patch = buildDeepSeekRequestPatch({
    supportsReasoning: true,
    hasTools: false,
    reasoningLevel: 'xhigh',
  });
  assert.deepEqual(patch.thinking, { type: 'enabled' });
  assert.equal(patch.reasoning_effort, 'max');
});

test('keeps thinking enabled when tools are present once replay is implemented', () => {
  const patch = buildDeepSeekRequestPatch({
    supportsReasoning: true,
    hasTools: true,
    reasoningLevel: 'high',
  });
  assert.deepEqual(patch.thinking, { type: 'enabled' });
  assert.equal(patch.reasoning_effort, 'high');
});

test('falls back to high effort when reasoning level is missing', () => {
  const patch = buildDeepSeekRequestPatch({
    supportsReasoning: true,
    hasTools: false,
  });
  assert.deepEqual(patch.thinking, { type: 'enabled' });
  assert.equal(patch.reasoning_effort, 'high');
});

test('decodeReasoningDataPart returns text only for the reasoning MIME', () => {
  const data = new TextEncoder().encode('Hello reasoning');
  assert.equal(
    decodeReasoningDataPart(data, DEEPSEEK_REASONING_MIME),
    'Hello reasoning'
  );
  assert.equal(decodeReasoningDataPart(data, 'image/png'), undefined);
  assert.equal(decodeReasoningDataPart(data, undefined), undefined);
});

test('replay strips reasoning fields when thinking is disabled', () => {
  const messages: Array<Record<string, unknown>> = [
    { role: 'assistant', content: 'hi', __reasoningContent: 'because' },
    { role: 'user', content: 'hello' },
  ];
  applyReasoningContentReplay(messages, false);
  assert.equal('reasoning_content' in messages[0], false);
  assert.equal('__reasoningContent' in messages[0], false);
  assert.equal('reasoning_content' in messages[1], false);
});

test('replay promotes stashed reasoning to reasoning_content when thinking is enabled', () => {
  const messages: Array<Record<string, unknown>> = [
    { role: 'assistant', content: 'hi', __reasoningContent: 'because of X' },
    { role: 'user', content: 'follow up' },
    { role: 'assistant', content: 'maybe' },
    { role: 'tool', tool_call_id: 'c1', content: 'result' },
  ];
  applyReasoningContentReplay(messages, true);
  assert.equal(messages[0].reasoning_content, 'because of X');
  assert.equal('__reasoningContent' in messages[0], false);
  assert.equal(messages[2].reasoning_content, '', 'missing reasoning becomes empty string');
  assert.equal('reasoning_content' in messages[3], false, 'tool messages are not touched');
});
