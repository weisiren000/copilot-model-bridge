import test from 'node:test';
import assert from 'node:assert/strict';

test('builds Anthropic request body with stream, tools, and thinking', () => {
  const {
    buildAnthropicRequestBody,
  } = require('../provider/anthropic/cmb.anthropic.request') as typeof import('../provider/anthropic/cmb.anthropic.request');

  const body = buildAnthropicRequestBody({
    modelId: 'claude-sonnet-4-5',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    maxOutputTokens: 4096,
    supportsReasoning: true,
    reasoningLevel: 'medium',
    toolOptions: {
      tools: [{ name: 'read_file', input_schema: { type: 'object', properties: {} } }],
      tool_choice: { type: 'auto' },
    },
  });

  assert.deepEqual(body, {
    model: 'claude-sonnet-4-5',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    stream: true,
    max_tokens: 4096,
    thinking: {
      type: 'enabled',
      budget_tokens: 1638,
      display: 'summarized',
    },
    tools: [{ name: 'read_file', input_schema: { type: 'object', properties: {} } }],
    tool_choice: { type: 'auto' },
  });
});

test('builds Anthropic thinking with omitted display when configured', () => {
  const {
    buildAnthropicRequestBody,
  } = require('../provider/anthropic/cmb.anthropic.request') as typeof import('../provider/anthropic/cmb.anthropic.request');

  const body = buildAnthropicRequestBody({
    modelId: 'claude-sonnet-4-5',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    maxOutputTokens: 4096,
    supportsReasoning: true,
    reasoningLevel: 'medium',
    thinkingDisplay: 'omitted',
    toolOptions: {},
  });

  assert.deepEqual(body.thinking, {
    type: 'enabled',
    budget_tokens: 1638,
    display: 'omitted',
  });
});

test('omits Anthropic thinking for non-Claude compatible models by default', () => {
  const {
    buildAnthropicRequestBody,
  } = require('../provider/anthropic/cmb.anthropic.request') as typeof import('../provider/anthropic/cmb.anthropic.request');

  const body = buildAnthropicRequestBody({
    modelId: 'minimax-m3',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    maxOutputTokens: 4096,
    supportsReasoning: true,
    reasoningLevel: 'medium',
    toolOptions: {},
  });

  assert.equal(body.thinking, undefined);
});

test('allows compatible non-Claude models to opt into Anthropic thinking', () => {
  const {
    buildAnthropicRequestBody,
  } = require('../provider/anthropic/cmb.anthropic.request') as typeof import('../provider/anthropic/cmb.anthropic.request');

  const body = buildAnthropicRequestBody({
    modelId: 'custom-reasoner',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    maxOutputTokens: 4096,
    supportsReasoning: true,
    reasoningLevel: 'medium',
    thinkingMode: 'enabled',
    toolOptions: {},
  });

  assert.deepEqual(body.thinking, {
    type: 'enabled',
    budget_tokens: 1638,
    display: 'summarized',
  });
});

test('builds Anthropic headers with x-api-key and version header', () => {
  const {
    buildAnthropicRequestHeaders,
  } = require('../provider/anthropic/cmb.anthropic.headers') as typeof import('../provider/anthropic/cmb.anthropic.headers');

  assert.deepEqual(buildAnthropicRequestHeaders({ apiKey: 'secret' }), {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
    'User-Agent': 'Copilot Model Bridge',
    'X-Api-Key': 'secret',
    'anthropic-version': '2023-06-01',
  });
});

test('omits Anthropic thinking when max tokens cannot fit the minimum budget', () => {
  const {
    buildAnthropicRequestBody,
  } = require('../provider/anthropic/cmb.anthropic.request') as typeof import('../provider/anthropic/cmb.anthropic.request');

  const body = buildAnthropicRequestBody({
    modelId: 'claude-sonnet-4-5',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    maxOutputTokens: 512,
    supportsReasoning: true,
    reasoningLevel: 'medium',
    toolOptions: {},
  });

  assert.equal(body.thinking, undefined);
});
