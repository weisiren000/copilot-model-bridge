import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChatRequestHeaders, isOpenRouterBaseUrl } from '../requestHeaders';

test('builds default chat request headers for generic providers', () => {
  assert.deepEqual(
    buildChatRequestHeaders({
      baseUrl: 'https://example.com/v1',
      apiKey: 'secret',
    }),
    {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'User-Agent': 'Copilot Model Bridge',
      'Authorization': 'Bearer secret',
    }
  );
});

test('adds OpenRouter attribution headers for openrouter endpoints', () => {
  assert.deepEqual(
    buildChatRequestHeaders({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'secret',
    }),
    {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'User-Agent': 'Copilot Model Bridge',
      'Authorization': 'Bearer secret',
      'HTTP-Referer': 'https://github.com/weisiren000/copilot-model-bridge',
      'X-OpenRouter-Title': 'Copilot Model Bridge',
    }
  );
});

test('does not add authorization header when api key is empty', () => {
  const headers = buildChatRequestHeaders({
    baseUrl: 'https://example.com/v1',
    apiKey: '',
  });

  assert.equal(headers['Authorization'], undefined);
});

test('detects OpenRouter hostnames safely', () => {
  assert.equal(isOpenRouterBaseUrl('https://openrouter.ai/api/v1'), true);
  assert.equal(isOpenRouterBaseUrl('https://edge.openrouter.ai/api/v1'), true);
  assert.equal(isOpenRouterBaseUrl('https://example.com/v1'), false);
  assert.equal(isOpenRouterBaseUrl('not a url'), false);
});
