import test from 'node:test';
import assert from 'node:assert/strict';

test('builds Responses request body with max_output_tokens and reasoning', () => {
  const {
    buildResponsesRequestBody,
  } = require('../provider/openaiCompatible/responses/cmb.responses.request') as typeof import('../provider/openaiCompatible/responses/cmb.responses.request');

  const body = buildResponsesRequestBody({
    modelId: 'gpt-5.1',
    input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hello' }] }],
    instructions: 'Be concise.',
    maxOutputTokens: 123,
    reasoningEffort: 'medium',
    toolOptions: {},
  });

  assert.deepEqual(body, {
    model: 'gpt-5.1',
    input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hello' }] }],
    instructions: 'Be concise.',
    stream: true,
    store: false,
    max_output_tokens: 123,
    reasoning: { effort: 'medium' },
  });
});
