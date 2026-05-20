import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import Module from 'node:module';
import { AddressInfo } from 'node:net';
import type { ProviderConfig } from '../types';

class LanguageModelTextPart {
  constructor(readonly value: string) {}
}

class LanguageModelDataPart {
  constructor(readonly data: Uint8Array, readonly mimeType?: string) {}
}

class LanguageModelToolCallPart {
  constructor(
    readonly callId: string,
    readonly name: string,
    readonly input: unknown
  ) {}
}

class LanguageModelToolResultPart {
  constructor(
    readonly callId: string,
    readonly content: unknown[]
  ) {}
}

const vscodeMock = {
  CancellationError: class CancellationError extends Error {},
  LanguageModelChatMessageRole: {
    User: 1,
    Assistant: 2,
  },
  LanguageModelChatToolMode: {
    Required: 1,
  },
  LanguageModelDataPart,
  LanguageModelTextPart,
  LanguageModelToolCallPart,
  LanguageModelToolResultPart,
};

const moduleLoader = Module as unknown as {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
};
const originalLoad = moduleLoader._load;
moduleLoader._load = function loadWithVscodeMock(
  request: string,
  parent: unknown,
  isMain: boolean
): unknown {
  if (request === 'vscode') {
    return vscodeMock;
  }
  return originalLoad.call(this, request, parent, isMain);
};

const {
  sendChatRequest,
} = require('../provider/core/cmb.provider.request') as typeof import('../provider/core/cmb.provider.request');

test('caps DeepSeek request max_tokens before sending the API request', async () => {
  let receivedBody: Record<string, unknown> | undefined;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      receivedBody = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end('data: [DONE]\n\n');
    });
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const provider: ProviderConfig = {
    id: 'deepseek',
    displayName: 'DeepSeek',
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    apiKey: 'key',
    models: [],
  };

  try {
    await sendChatRequest(
      provider,
      {
        id: 'deepseek-v4-flash',
        name: 'DeepSeek V4 Flash',
        supportsReasoning: false,
      },
      {
        id: 'deepseek::deepseek-v4-flash',
        name: 'DeepSeek V4 Flash',
        family: 'deepseek',
        version: '',
        maxInputTokens: 393216,
        maxOutputTokens: 1000000,
        capabilities: {},
      },
      [{
        role: vscodeMock.LanguageModelChatMessageRole.User,
        content: [new LanguageModelTextPart('hello')],
      }] as never,
      {
        toolMode: 0,
      } as never,
      { report() {} },
      {
        isCancellationRequested: false,
        onCancellationRequested: () => ({ dispose() {} }),
      } as never
    );

    assert.equal(receivedBody?.max_tokens, 393216);
    assert.deepEqual(receivedBody?.thinking, { type: 'disabled' });
  } finally {
    server.close();
  }
});
