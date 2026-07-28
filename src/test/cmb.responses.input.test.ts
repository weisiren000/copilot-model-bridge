import test from 'node:test';
import assert from 'node:assert/strict';

test('converts user text and image content to Responses input parts', () => {
  const {
    convertToResponsesInput,
  } = require('../provider/openaiCompatible/responses/cmb.responses.input') as typeof import('../provider/openaiCompatible/responses/cmb.responses.input');

  const result = convertToResponsesInput([{
    role: 'user',
    content: [
      { type: 'text', text: 'look' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,/w==', detail: 'high' } },
    ],
  }]);

  assert.deepEqual(result, {
    input: [{
      type: 'message',
      role: 'user',
      content: [
        { type: 'input_text', text: 'look' },
        { type: 'input_image', image_url: 'data:image/png;base64,/w==', detail: 'high' },
      ],
    }],
  });
});

test('converts Chat tool history to Responses function call items', () => {
  const {
    convertToResponsesInput,
  } = require('../provider/openaiCompatible/responses/cmb.responses.input') as typeof import('../provider/openaiCompatible/responses/cmb.responses.input');

  const result = convertToResponsesInput([
    {
      role: 'assistant',
      content: null,
      tool_calls: [{
        id: 'call-1',
        type: 'function',
        function: {
          name: 'read_file',
          arguments: '{"path":"README.md"}',
        },
      }],
    },
    {
      role: 'tool',
      tool_call_id: 'call-1',
      name: 'read_file',
      content: 'file contents',
    },
  ]);

  assert.deepEqual(result.input, [
    {
      type: 'function_call',
      call_id: 'call-1',
      name: 'read_file',
      arguments: '{"path":"README.md"}',
    },
    {
      type: 'function_call_output',
      call_id: 'call-1',
      output: 'file contents',
    },
  ]);
});

test('extracts system text into instructions', () => {
  const {
    convertToResponsesInput,
  } = require('../provider/openaiCompatible/responses/cmb.responses.input') as typeof import('../provider/openaiCompatible/responses/cmb.responses.input');

  assert.deepEqual(convertToResponsesInput([
    { role: 'system', content: 'Be concise.' },
    { role: 'user', content: 'hello' },
  ]), {
    instructions: 'Be concise.',
    input: [{
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: 'hello' }],
    }],
  });
});
