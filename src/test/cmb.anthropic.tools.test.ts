import test from 'node:test';
import assert from 'node:assert/strict';

test('builds Anthropic tools and maps required tool mode to any', () => {
  const {
    buildAnthropicToolOptions,
  } = require('../provider/anthropic/cmb.anthropic.tools') as typeof import('../provider/anthropic/cmb.anthropic.tools');

  assert.deepEqual(
    buildAnthropicToolOptions({
      tools: [{
        name: 'read_file',
        description: 'Read a file',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
      }],
      requestedToolMode: 'required',
      toolChoiceMode: 'required',
    }),
    {
      tools: [{
        name: 'read_file',
        description: 'Read a file',
        input_schema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
      }],
      tool_choice: { type: 'any' },
    }
  );
});

test('omits Anthropic tool_choice when configured to omit', () => {
  const {
    buildAnthropicToolOptions,
  } = require('../provider/anthropic/cmb.anthropic.tools') as typeof import('../provider/anthropic/cmb.anthropic.tools');

  assert.deepEqual(
    buildAnthropicToolOptions({
      tools: [{ name: 'search', inputSchema: { type: 'object', properties: {} } }],
      requestedToolMode: 'auto',
      toolChoiceMode: 'omit',
    }),
    {
      tools: [{ name: 'search', input_schema: { type: 'object', properties: {} } }],
    }
  );
});

test('maps automatic tool requests to Anthropic auto even when model default is required', () => {
  const {
    buildAnthropicToolOptions,
  } = require('../provider/anthropic/cmb.anthropic.tools') as typeof import('../provider/anthropic/cmb.anthropic.tools');

  assert.deepEqual(
    buildAnthropicToolOptions({
      tools: [{ name: 'search', inputSchema: { type: 'object', properties: {} } }],
      requestedToolMode: 'auto',
      toolChoiceMode: 'required',
    }).tool_choice,
    { type: 'auto' }
  );
});

test('supports forcing a specific Anthropic tool and disabling parallel tool use', () => {
  const {
    buildAnthropicToolOptions,
  } = require('../provider/anthropic/cmb.anthropic.tools') as typeof import('../provider/anthropic/cmb.anthropic.tools');

  assert.deepEqual(
    buildAnthropicToolOptions({
      tools: [{ name: 'search', inputSchema: { type: 'object', properties: {} } }],
      requestedToolMode: 'required',
      toolChoiceMode: 'required',
      specificToolName: 'search',
      disableParallelToolUse: true,
    }).tool_choice,
    { type: 'tool', name: 'search', disable_parallel_tool_use: true }
  );
});

test('rejects invalid Anthropic tool input schemas', () => {
  const {
    buildAnthropicToolOptions,
  } = require('../provider/anthropic/cmb.anthropic.tools') as typeof import('../provider/anthropic/cmb.anthropic.tools');

  assert.throws(
    () => buildAnthropicToolOptions({
      tools: [{ name: 'broken', inputSchema: 'not an object' }],
      requestedToolMode: 'auto',
    }),
    /Anthropic tool "broken" input_schema must be an object JSON Schema/
  );
});
