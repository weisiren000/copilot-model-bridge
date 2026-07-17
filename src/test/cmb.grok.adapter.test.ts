import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getGrokModelProfile,
  isGrokModelId,
  isGrokRequest,
  isOfficialXAIBaseUrl,
  normalizeGrokReasoningEffort,
  resolveGrokEndpointUrl,
  resolveGrokApiStyle,
} from '../provider/grok/cmb.grok.adapter';

test('detects official xAI endpoints by hostname', () => {
  assert.equal(isOfficialXAIBaseUrl('https://api.x.ai/v1'), true);
  assert.equal(isOfficialXAIBaseUrl('https://api.x.ai/v1/'), true);
  assert.equal(isOfficialXAIBaseUrl('https://console.x.ai/v1'), false);
  assert.equal(isOfficialXAIBaseUrl('https://x.ai/v1'), false);
  assert.equal(isOfficialXAIBaseUrl('not a url'), false);
});

test('detects Grok requests by provider identity or model id', () => {
  assert.equal(isGrokModelId('grok-4.5'), true);
  assert.equal(isGrokModelId('x-ai/grok-4.20-reasoning'), true);
  assert.equal(isGrokModelId('vendor/grok-code-fast-1'), true);
  assert.equal(isGrokModelId('gpt-5.6-sol'), false);

  assert.equal(
    isGrokRequest({ id: 'xai', baseUrl: 'https://proxy.example.com/v1' }, 'custom-model'),
    true
  );
  assert.equal(
    isGrokRequest({ id: 'local-xai-proxy', baseUrl: 'https://proxy.example.com/v1' }, 'custom-model'),
    true
  );
  assert.equal(
    isGrokRequest({ id: 'custom', baseUrl: 'https://api.x.ai/v1' }, 'custom-model'),
    true
  );
  assert.equal(
    isGrokRequest({ id: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1' }, 'x-ai/grok-4.5'),
    true
  );
  assert.equal(
    isGrokRequest({ id: 'openai', baseUrl: 'https://api.openai.com/v1' }, 'gpt-5.6-sol'),
    false
  );
});

test('forces official xAI endpoints to Responses while preserving proxy API style', () => {
  assert.equal(
    resolveGrokApiStyle({ id: 'xai', baseUrl: 'https://api.x.ai/v1', apiStyle: 'chat' }),
    'responses'
  );
  assert.equal(
    resolveGrokApiStyle({ id: 'xai-proxy', baseUrl: 'https://proxy.example.com/v1', apiStyle: 'chat' }),
    'chat'
  );
  assert.equal(
    resolveGrokApiStyle({ id: 'xai-proxy', baseUrl: 'https://proxy.example.com/v1', apiStyle: 'responses' }),
    'responses'
  );
  assert.equal(
    resolveGrokApiStyle({ id: 'xai', baseUrl: 'https://api.x.ai/v1', apiStyle: 'anthropic' }),
    'responses'
  );
});

test('resolves Grok endpoint URLs without duplicate slashes', () => {
  assert.equal(
    resolveGrokEndpointUrl('https://api.x.ai/v1/', 'responses'),
    'https://api.x.ai/v1/responses'
  );
  assert.equal(
    resolveGrokEndpointUrl('https://proxy.example.com/openai/', '/chat/completions'),
    'https://proxy.example.com/openai/chat/completions'
  );
});

test('normalizes Grok reasoning effort to model-supported values', () => {
  assert.equal(normalizeGrokReasoningEffort('grok-4.3', 'none'), 'none');
  assert.equal(normalizeGrokReasoningEffort('x-ai/grok-4.3-20260701', 'none'), 'none');
  assert.equal(normalizeGrokReasoningEffort('grok-latest', 'none'), 'none');
  assert.equal(normalizeGrokReasoningEffort('grok-4.5', 'none'), 'low');
  assert.equal(normalizeGrokReasoningEffort('grok-4.5', 'low'), 'low');
  assert.equal(normalizeGrokReasoningEffort('grok-4.5', 'medium'), 'medium');
  assert.equal(normalizeGrokReasoningEffort('grok-4.5', 'high'), 'high');
  assert.equal(normalizeGrokReasoningEffort('grok-4.5', 'xhigh'), 'high');
  assert.equal(normalizeGrokReasoningEffort('grok-4.5', 'max'), 'high');
  assert.equal(normalizeGrokReasoningEffort('grok-4.5', undefined), undefined);
});

test('allows xhigh effort only for Grok multi-agent models', () => {
  assert.equal(normalizeGrokReasoningEffort('grok-4.20-multi-agent', 'xhigh'), 'xhigh');
  assert.equal(normalizeGrokReasoningEffort('grok-4.20-multi-agent-0309', 'max'), 'xhigh');
  assert.equal(normalizeGrokReasoningEffort('x-ai/grok-4.20-multi-agent', 'high'), 'high');
});

test('provides official Grok model profiles for configuration suggestions', () => {
  assert.deepEqual(getGrokModelProfile('https://api.x.ai/v1', 'grok-4.5'), {
    id: 'grok-4.5',
    name: 'Grok 4.5',
    family: 'grok-4.5',
    contextWindowTokens: 500000,
    supportsToolCalling: true,
    supportsVision: true,
    supportsEditTools: true,
    supportsReasoning: true,
    supportedReasoningLevels: ['low', 'medium', 'high'],
    defaultReasoningLevel: 'high',
  });
  assert.deepEqual(getGrokModelProfile('https://api.x.ai/v1', 'grok-4.3-latest'), {
    id: 'grok-4.3-latest',
    name: 'Grok 4.3',
    family: 'grok-4.3',
    contextWindowTokens: 1000000,
    supportsToolCalling: true,
    supportsVision: true,
    supportsEditTools: true,
    supportsReasoning: true,
    supportedReasoningLevels: ['none', 'low', 'medium', 'high'],
    defaultReasoningLevel: 'low',
  });
  assert.equal(
    getGrokModelProfile('https://api.x.ai/v1', 'grok-latest')?.family,
    'grok-4.3'
  );
  assert.deepEqual(getGrokModelProfile('https://api.x.ai/v1', 'grok-4.20-multi-agent-0309'), {
    id: 'grok-4.20-multi-agent-0309',
    name: 'Grok 4.20 Multi-Agent',
    family: 'grok-4.20',
    contextWindowTokens: 1000000,
    supportsToolCalling: true,
    supportsVision: true,
    supportsEditTools: true,
    supportsReasoning: true,
    supportedReasoningLevels: ['low', 'medium', 'high', 'xhigh'],
    defaultReasoningLevel: 'high',
  });
  assert.deepEqual(getGrokModelProfile('https://api.x.ai/v1', 'grok-4.20-0309-reasoning'), {
    id: 'grok-4.20-0309-reasoning',
    name: 'Grok 4.20',
    family: 'grok-4.20',
    contextWindowTokens: 1000000,
    supportsToolCalling: true,
    supportsVision: true,
    supportsEditTools: true,
    supportsReasoning: false,
  });
  assert.deepEqual(getGrokModelProfile('https://api.x.ai/v1', 'grok-code-fast-1'), {
    id: 'grok-code-fast-1',
    name: 'Grok Build 0.1',
    family: 'grok-build',
    contextWindowTokens: 256000,
    supportsToolCalling: true,
    supportsVision: true,
    supportsEditTools: true,
    supportsReasoning: false,
  });
  assert.equal(
    getGrokModelProfile('https://openrouter.ai/api/v1', 'grok-4.5'),
    undefined
  );
  assert.equal(
    getGrokModelProfile('https://api.x.ai/v1', 'grok-imagine-image'),
    undefined
  );
});