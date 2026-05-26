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
  let receivedPath = '';
  let receivedBody: Record<string, unknown> | undefined;
  const server = http.createServer((req, res) => {
    receivedPath = req.url ?? '';
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

    assert.equal(receivedPath, '/v1/chat/completions');
    assert.equal(receivedBody?.max_tokens, 393216);
    assert.deepEqual(receivedBody?.thinking, { type: 'disabled' });
  } finally {
    server.close();
  }
});

test('applies Gemini adapter before sending the API request', async () => {
  let receivedBody: Record<string, any> | undefined;
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
    id: 'local-gemini',
    displayName: 'Local Gemini',
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    apiKey: 'key',
    models: [],
  };

  try {
    await sendChatRequest(
      provider,
      {
        id: 'gemini-3.1-pro-preview',
        name: 'Gemini 3.1 Pro Preview',
        supportsReasoning: false,
      },
      {
        id: 'local-gemini::gemini-3.1-pro-preview',
        name: 'Gemini 3.1 Pro Preview',
        family: 'gemini',
        version: '',
        maxInputTokens: 1000000,
        maxOutputTokens: 65536,
        capabilities: {},
      },
      [{
        role: vscodeMock.LanguageModelChatMessageRole.User,
        content: [new LanguageModelTextPart('hello')],
      }] as never,
      {
        toolMode: 0,
        tools: [{
          name: 'search_files',
          description: 'Search files',
          inputSchema: {
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
        }],
      } as never,
      { report() {} },
      {
        isCancellationRequested: false,
        onCancellationRequested: () => ({ dispose() {} }),
      } as never
    );

    assert.deepEqual(receivedBody?.tools, [{
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
  } finally {
    server.close();
  }
});

test('requests Gemini thought summaries for reasoning models', async () => {
  let receivedBody: Record<string, any> | undefined;
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
    id: 'local-gemini',
    displayName: 'Local Gemini',
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    apiKey: 'key',
    models: [],
  };

  try {
    await sendChatRequest(
      provider,
      {
        id: 'gemini-3.1-pro-preview',
        name: 'Gemini 3.1 Pro Preview',
        supportsReasoning: true,
        includeThoughts: true,
        defaultReasoningLevel: 'medium',
        supportedReasoningLevels: ['medium', 'high'],
      },
      {
        id: 'local-gemini::gemini-3.1-pro-preview',
        name: 'Gemini 3.1 Pro Preview',
        family: 'gemini',
        version: '',
        maxInputTokens: 1000000,
        maxOutputTokens: 65536,
        capabilities: {},
      },
      [{
        role: vscodeMock.LanguageModelChatMessageRole.User,
        content: [new LanguageModelTextPart('hello')],
      }] as never,
      { toolMode: 0 } as never,
      { report() {} },
      {
        isCancellationRequested: false,
        onCancellationRequested: () => ({ dispose() {} }),
      } as never
    );

    assert.deepEqual(receivedBody?.extra_body, {
      google: {
        thinking_config: {
          include_thoughts: true,
        },
        thought_tag_marker: 'think',
      },
    });
  } finally {
    server.close();
  }
});

test('does not request Gemini thought summaries unless explicitly enabled', async () => {
  let receivedBody: Record<string, any> | undefined;
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
    id: 'local-gemini',
    displayName: 'Local Gemini',
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    apiKey: 'key',
    models: [],
  };

  try {
    await sendChatRequest(
      provider,
      {
        id: 'gemini-3.1-pro-preview',
        name: 'Gemini 3.1 Pro Preview',
        supportsReasoning: true,
        defaultReasoningLevel: 'medium',
        supportedReasoningLevels: ['medium', 'high'],
      },
      {
        id: 'local-gemini::gemini-3.1-pro-preview',
        name: 'Gemini 3.1 Pro Preview',
        family: 'gemini',
        version: '',
        maxInputTokens: 1000000,
        maxOutputTokens: 65536,
        capabilities: {},
      },
      [{
        role: vscodeMock.LanguageModelChatMessageRole.User,
        content: [new LanguageModelTextPart('hello')],
      }] as never,
      { toolMode: 0 } as never,
      { report() {} },
      {
        isCancellationRequested: false,
        onCancellationRequested: () => ({ dispose() {} }),
      } as never
    );

    assert.equal(receivedBody?.extra_body, undefined);
  } finally {
    server.close();
  }
});

test('sends Responses request when provider apiStyle is responses', async () => {
  let receivedPath = '';
  let receivedBody: Record<string, unknown> | undefined;
  const server = http.createServer((req, res) => {
    receivedPath = req.url ?? '';
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      receivedBody = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end([
        'event: response.output_text.delta',
        'data: {"type":"response.output_text.delta","delta":"hello"}',
        '',
        'event: response.completed',
        'data: {"type":"response.completed"}',
        '',
      ].join('\n'));
    });
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const provider: ProviderConfig = {
    id: 'openai',
    displayName: 'OpenAI',
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    apiKey: 'key',
    apiStyle: 'responses',
    models: [],
  };

  try {
    await sendChatRequest(
      provider,
      { id: 'gpt-5.1', name: 'GPT 5.1' },
      {
        id: 'openai::gpt-5.1',
        name: 'GPT 5.1',
        family: 'gpt',
        version: '',
        maxInputTokens: 128000,
        maxOutputTokens: 4096,
        capabilities: {},
      },
      [{
        role: vscodeMock.LanguageModelChatMessageRole.User,
        content: [new LanguageModelTextPart('hello')],
      }] as never,
      { toolMode: 0 } as never,
      { report() {} },
      { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) } as never
    );

    assert.equal(receivedPath, '/v1/responses');
    assert.equal(receivedBody?.max_output_tokens, 4096);
    assert.equal(receivedBody?.max_tokens, undefined);
    assert.equal(receivedBody?.stream, true);
  } finally {
    server.close();
  }
});

test('reports gateway timeouts as friendly upstream errors', async () => {
  const server = http.createServer((req, res) => {
    req.resume();
    res.writeHead(504, { 'Content-Type': 'text/html' });
    res.end('<html><body><h1>504 Gateway Time-out</h1></body></html>');
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const provider: ProviderConfig = {
    id: 'openai',
    displayName: 'OpenAI',
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    apiKey: 'key',
    apiStyle: 'responses',
    models: [],
  };

  try {
    await assert.rejects(
      sendChatRequest(
        provider,
        { id: 'gpt-5.1', name: 'GPT 5.1' },
        {
          id: 'openai::gpt-5.1',
          name: 'GPT 5.1',
          family: 'gpt',
          version: '',
          maxInputTokens: 128000,
          maxOutputTokens: 4096,
          capabilities: {},
        },
        [{
          role: vscodeMock.LanguageModelChatMessageRole.User,
          content: [new LanguageModelTextPart('hello')],
        }] as never,
        { toolMode: 0 } as never,
        { report() {} },
        { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) } as never
      ),
      /上游模型服务暂时不可用 \(HTTP 504\)，请稍后重试。/
    );
  } finally {
    server.close();
  }
});
