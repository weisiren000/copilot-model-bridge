import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import {
  postStreaming,
  postStreamingChatCompletion,
} from '../provider/openaiCompatible/cmb.openaiCompatible.chatHttpClient';
import { USER_AGENT } from '../provider/cmb.branding';

test('sends custom User-Agent header on real HTTP requests', async () => {
  let receivedUserAgent = '';

  const server = http.createServer((req, res) => {
    receivedUserAgent = req.headers['user-agent'] ?? '';
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end('data: [DONE]\n\n');
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;

  try {
    const response = await postStreamingChatCompletion(
      `http://127.0.0.1:${address.port}/chat/completions`,
      {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'User-Agent': USER_AGENT,
      },
      { stream: true },
      new AbortController().signal
    );

    assert.equal(response.ok, true);
    assert.equal(receivedUserAgent, USER_AGENT);
  } finally {
    server.close();
  }
});

test('posts streaming request to arbitrary OpenAI-compatible path', async () => {
  let receivedPath = '';
  const server = http.createServer((req, res) => {
    receivedPath = req.url ?? '';
    req.resume();
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end('data: [DONE]\n\n');
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;

  try {
    const response = await postStreaming(
      `http://127.0.0.1:${address.port}/v1/responses`,
      { Authorization: 'Bearer key', 'Content-Type': 'application/json' },
      { stream: true },
      new AbortController().signal
    );

    assert.equal(response.ok, true);
    assert.equal(receivedPath, '/v1/responses');
  } finally {
    server.close();
  }
});
