import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { postStreamingChatCompletion } from '../provider/openaiCompatible/cmb.openaiCompatible.chatHttpClient';

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
        'User-Agent': 'Copilot Model Bridge',
      },
      { stream: true },
      new AbortController().signal
    );

    assert.equal(response.ok, true);
    assert.equal(receivedUserAgent, 'Copilot Model Bridge');
  } finally {
    server.close();
  }
});
