import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGeminiRequestPatch,
  isGeminiModelId,
  isGeminiRequest,
  resolveGeminiOpenAICompatibleUrl,
  sanitizeGeminiToolSchema,
} from '../provider/gemini/cmb.gemini.adapter';

test('detects Gemini requests by provider or model id', () => {
  assert.equal(isGeminiModelId('gemini-3.1-pro-preview'), true);
  assert.equal(isGeminiModelId('models/gemini-3.1-pro-preview'), true);
  assert.equal(isGeminiModelId('google/gemini-3.5-flash'), true);
  assert.equal(isGeminiModelId('gpt-4o'), false);
  assert.equal(
    isGeminiRequest({ id: 'local-gemini', baseUrl: 'http://localhost:41731/v1' }, 'gpt-4o'),
    true
  );
  assert.equal(
    isGeminiRequest({ id: 'openai', baseUrl: 'https://api.openai.com/v1' }, 'gemini-3.1-pro-preview'),
    true
  );
  assert.equal(
    isGeminiRequest({ id: 'openai', baseUrl: 'https://api.openai.com/v1' }, 'gpt-4o'),
    false
  );
});

test('resolves official Gemini OpenAI-compatible chat completions URL', () => {
  assert.equal(
    resolveGeminiOpenAICompatibleUrl(
      { id: 'google', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
      'chat/completions'
    ),
    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
  );
  assert.equal(
    resolveGeminiOpenAICompatibleUrl(
      { id: 'google', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/' },
      'chat/completions'
    ),
    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
  );
});

test('leaves non-Google Gemini-compatible proxy URLs unchanged', () => {
  assert.equal(
    resolveGeminiOpenAICompatibleUrl(
      { id: 'local-gemini', baseUrl: 'http://localhost:41731/v1' },
      'chat/completions'
    ),
    'http://localhost:41731/v1/chat/completions'
  );
});

test('sanitizes JSON schema fields that Gemini tool declarations reject', () => {
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      path: {
        anyOf: [
          { type: 'string' },
          { type: 'null' },
        ],
        default: null,
      },
      options: {
        type: ['object', 'null'],
        additionalProperties: true,
        properties: {
          recursive: { type: 'boolean', default: false },
        },
      },
    },
    required: ['path', 123],
    $defs: {
      ignored: { type: 'string' },
    },
  };

  assert.deepEqual(sanitizeGeminiToolSchema(schema), {
    type: 'object',
    properties: {
      path: {
        type: 'string',
      },
      options: {
        type: 'object',
        properties: {
          recursive: { type: 'boolean' },
        },
      },
    },
    required: ['path'],
  });
});

test('drops required names that are not present in Gemini tool properties', () => {
  assert.deepEqual(sanitizeGeminiToolSchema({
    type: 'object',
    properties: {
      query: { type: 'string' },
    },
    required: ['query', 'missing'],
  }), {
    type: 'object',
    properties: {
      query: { type: 'string' },
    },
    required: ['query'],
  });
});

test('drops required names even when required appears before properties', () => {
  const schema: Record<string, unknown> = {};
  schema.type = 'object';
  schema.required = ['query', 'missing'];
  schema.properties = {
    query: { type: 'string' },
  };

  assert.deepEqual(sanitizeGeminiToolSchema(schema), {
    type: 'object',
    properties: {
      query: { type: 'string' },
    },
    required: ['query'],
  });
});

test('keeps only Gemini-supported schema keywords recursively', () => {
  assert.deepEqual(sanitizeGeminiToolSchema({
    type: 'object',
    title: 'Unsupported title',
    minLength: 1,
    properties: {
      count: {
        type: 'integer',
        minimum: 1,
        maximum: 5,
        multipleOf: 1,
      },
      mode: {
        type: 'string',
        enum: ['fast', 123],
        format: 'uri',
      },
      nested: {
        type: 'object',
        propertyNames: { pattern: 'x' },
        properties: {
          enabled: { type: 'boolean', readOnly: true },
        },
        required: ['enabled'],
      },
    },
    required: ['count', 'mode', 'nested'],
  }), {
    type: 'object',
    properties: {
      count: {
        type: 'integer',
        minimum: 1,
        maximum: 5,
      },
      mode: {
        type: 'string',
        enum: ['fast'],
      },
      nested: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
        },
        required: ['enabled'],
      },
    },
    required: ['count', 'mode', 'nested'],
  });
});

test('normalizes tuple array items to a single Gemini-compatible item schema', () => {
  assert.deepEqual(sanitizeGeminiToolSchema({
    type: 'object',
    properties: {
      edits: {
        type: 'array',
        items: [
          { type: 'string' },
          { type: 'number' },
        ],
      },
    },
    required: ['edits'],
  }), {
    type: 'object',
    properties: {
      edits: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['edits'],
  });
});

test('builds a Gemini request patch for tool declarations', () => {
  const patch = buildGeminiRequestPatch({
    tools: [{
      type: 'function',
      function: {
        name: 'search_files',
        description: 'Search files',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            query: {
              anyOf: [
                { type: 'string' },
                { type: 'null' },
              ],
            },
          },
          required: ['query'],
        },
      },
    }],
  });

  assert.deepEqual(patch.tools, [{
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search files',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
    },
  }]);
});

test('builds a Gemini request patch for thought summaries', () => {
  const patch = buildGeminiRequestPatch({
    includeThoughts: true,
  });

  assert.deepEqual(patch.extra_body, {
    google: {
      thinking_config: {
        include_thoughts: true,
      },
    },
  });
});

test('does not request Gemini thought summaries for non-reasoning models', () => {
  assert.deepEqual(buildGeminiRequestPatch({ includeThoughts: false }), {});
});
