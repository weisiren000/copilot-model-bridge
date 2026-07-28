import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import Module from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { AddressInfo } from 'node:net';
import type { ProviderConfig } from '../types';

class LanguageModelTextPart {
  constructor(readonly value: string) {}
}

class LanguageModelDataPart {
  constructor(readonly data: Uint8Array, readonly mimeType?: string) {}
}

class LanguageModelThinkingPart {
  constructor(readonly value: string | string[]) {}
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
  LanguageModelThinkingPart,
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

test('applies the Kimi K3 preserved-thinking contract in tool loops', async () => {
  let receivedBody: Record<string, any> | undefined;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      receivedBody = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end('data: [DONE]\n\n');
    });
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const provider: ProviderConfig = {
    id: 'opencode',
    displayName: 'OpenCode',
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    apiKey: 'key',
    apiStyle: 'chat',
    models: [],
  };

  try {
    await sendChatRequest(
      provider,
      {
        id: 'kimi-k3',
        name: 'Kimi K3',
        supportsReasoning: true,
        supportedReasoningLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
        defaultReasoningLevel: 'medium',
      },
      {
        id: 'opencode::kimi-k3',
        name: 'Kimi K3',
        family: 'kimi',
        version: '',
        maxInputTokens: 192000,
        maxOutputTokens: 64000,
        capabilities: {},
      },
      [
        {
          role: vscodeMock.LanguageModelChatMessageRole.Assistant,
          content: [
            new LanguageModelThinkingPart('inspect first'),
            new LanguageModelToolCallPart('call-1', 'read_file', { path: 'README.md' }),
          ],
        },
        {
          role: vscodeMock.LanguageModelChatMessageRole.User,
          content: [
            new LanguageModelToolResultPart('call-1', [
              new LanguageModelTextPart('file contents'),
            ]),
          ],
        },
      ] as never,
      { toolMode: 0 } as never,
      { report() {} },
      {
        isCancellationRequested: false,
        onCancellationRequested: () => ({ dispose() {} }),
      } as never
    );

    assert.equal(receivedBody?.reasoning_effort, 'max');
    assert.equal(receivedBody?.messages?.[0]?.reasoning_content, 'inspect first');
    assert.equal(receivedBody?.messages?.[0]?.__reasoningContent, undefined);
  } finally {
    server.close();
  }
});

test('uses Kimi K2.6 thinking parameters instead of reasoning_effort', async () => {
  let receivedBody: Record<string, any> | undefined;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      receivedBody = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end('data: [DONE]\n\n');
    });
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const provider: ProviderConfig = {
    id: 'moonshot',
    displayName: 'Moonshot',
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    apiKey: 'key',
    apiStyle: 'chat',
    models: [],
  };

  try {
    await sendChatRequest(
      provider,
      {
        id: 'kimi-k2.6',
        name: 'Kimi K2.6',
        supportsReasoning: true,
        supportedReasoningLevels: ['medium', 'high', 'max'],
        defaultReasoningLevel: 'medium',
        toolChoiceMode: 'required',
      },
      {
        id: 'moonshot::kimi-k2.6',
        name: 'Kimi K2.6',
        family: 'kimi',
        version: '',
        maxInputTokens: 256000,
        maxOutputTokens: 32000,
        capabilities: {},
      },
      [{
        role: vscodeMock.LanguageModelChatMessageRole.User,
        content: [new LanguageModelTextPart('hello')],
      }] as never,
      {
        toolMode: vscodeMock.LanguageModelChatToolMode.Required,
        tools: [{
          name: 'read_file',
          description: 'Read a file',
          inputSchema: { type: 'object', properties: {} },
        }],
      } as never,
      { report() {} },
      {
        isCancellationRequested: false,
        onCancellationRequested: () => ({ dispose() {} }),
      } as never
    );

    assert.equal(receivedBody?.reasoning_effort, undefined);
    assert.deepEqual(receivedBody?.thinking, { type: 'enabled', keep: 'all' });
    assert.equal(receivedBody?.tool_choice, 'auto');
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

test('passes through configured Gemini max_tokens without raising it', async () => {
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
        id: 'gemini-3.5-flash',
        name: 'Gemini 3.5 Flash',
        supportsReasoning: true,
      },
      {
        id: 'local-gemini::gemini-3.5-flash',
        name: 'Gemini 3.5 Flash',
        family: 'gemini',
        version: '',
        maxInputTokens: 1000000,
        maxOutputTokens: 32,
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

    assert.equal(receivedBody?.max_tokens, 32);
  } finally {
    server.close();
  }
});

test('uses configured model max_tokens instead of VS Code response metadata', async () => {
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
        id: 'gemini-3.5-flash',
        name: 'Gemini 3.5 Flash',
        supportsReasoning: true,
        maxOutputTokens: 65000,
      },
      {
        id: 'local-gemini::gemini-3.5-flash',
        name: 'Gemini 3.5 Flash',
        family: 'gemini',
        version: '',
        maxInputTokens: 1000000,
        maxOutputTokens: 32,
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

    assert.equal(receivedBody?.max_tokens, 65000);
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

test('normalizes Grok reasoning effort for Chat Completions proxies', async () => {
  let receivedPath = '';
  let receivedBody: Record<string, unknown> | undefined;
  const server = http.createServer((req, res) => {
    receivedPath = req.url ?? '';
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      receivedBody = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end('data: [DONE]\n\n');
    });
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const provider: ProviderConfig = {
    id: 'grok-proxy',
    displayName: 'Grok Proxy',
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    apiKey: 'key',
    apiStyle: 'chat',
    models: [],
  };

  try {
    await sendChatRequest(
      provider,
      {
        id: 'grok-4.5',
        name: 'Grok 4.5',
        supportsReasoning: true,
        defaultReasoningLevel: 'max',
        supportedReasoningLevels: ['low', 'medium', 'high', 'max'],
      },
      {
        id: 'grok-proxy::grok-4.5',
        name: 'Grok 4.5',
        family: 'grok',
        version: '',
        maxInputTokens: 500000,
        maxOutputTokens: 128000,
        capabilities: {},
      },
      [{
        role: vscodeMock.LanguageModelChatMessageRole.User,
        content: [new LanguageModelTextPart('hello')],
      }, {
        role: vscodeMock.LanguageModelChatMessageRole.Assistant,
        content: [
          new LanguageModelThinkingPart('internal summary'),
          new LanguageModelTextPart('previous answer'),
        ],
      }] as never,
      { toolMode: 0 } as never,
      { report() {} },
      { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) } as never
    );

    assert.equal(receivedPath, '/v1/chat/completions');
    assert.equal(receivedBody?.reasoning_effort, 'high');
    const messages = receivedBody?.messages as Array<Record<string, unknown>>;
    assert.equal('__reasoningContent' in messages[1], false);
    assert.equal('reasoning_content' in messages[1], false);
  } finally {
    server.close();
  }
});

test('normalizes Grok reasoning effort in Responses request bodies', async () => {
  let receivedPath = '';
  let receivedBody: Record<string, any> | undefined;
  const server = http.createServer((req, res) => {
    receivedPath = req.url ?? '';
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      receivedBody = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end('data: {"type":"response.completed"}\n\n');
    });
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const provider: ProviderConfig = {
    id: 'grok-proxy',
    displayName: 'Grok Proxy',
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    apiKey: 'key',
    apiStyle: 'responses',
    models: [],
  };

  try {
    await sendChatRequest(
      provider,
      {
        id: 'grok-4.5',
        name: 'Grok 4.5',
        supportsReasoning: true,
        defaultReasoningLevel: 'max',
        supportedReasoningLevels: ['low', 'medium', 'high', 'max'],
      },
      {
        id: 'grok-proxy::grok-4.5',
        name: 'Grok 4.5',
        family: 'grok',
        version: '',
        maxInputTokens: 500000,
        maxOutputTokens: 128000,
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
    assert.deepEqual(receivedBody?.reasoning, { effort: 'high', summary: 'auto' });
  } finally {
    server.close();
  }
});

test('sends Anthropic Messages request when provider apiStyle is anthropic', async () => {
  let receivedPath = '';
  let receivedHeaders: http.IncomingHttpHeaders = {};
  let receivedBody: Record<string, any> | undefined;
  const server = http.createServer((req, res) => {
    receivedPath = req.url ?? '';
    receivedHeaders = req.headers;
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      receivedBody = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end([
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hello"}}',
        '',
        'event: message_stop',
        'data: {"type":"message_stop"}',
        '',
      ].join('\n'));
    });
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const provider: ProviderConfig = {
    id: 'anthropic',
    displayName: 'Anthropic',
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    apiKey: 'anthropic-key',
    apiStyle: 'anthropic',
    models: [],
  };
  const reported: unknown[] = [];

  try {
    await sendChatRequest(
      provider,
      {
        id: 'claude-sonnet-4-5',
        name: 'Claude Sonnet 4.5',
        supportsReasoning: true,
        defaultReasoningLevel: 'medium',
      },
      {
        id: 'anthropic::claude-sonnet-4-5',
        name: 'Claude Sonnet 4.5',
        family: 'claude',
        version: '',
        maxInputTokens: 200000,
        maxOutputTokens: 4096,
        capabilities: {},
      },
      [{
        role: vscodeMock.LanguageModelChatMessageRole.User,
        content: [new LanguageModelTextPart('hello')],
      }] as never,
      { toolMode: 0 } as never,
      { report(part: unknown) { reported.push(part); } },
      { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) } as never
    );

    assert.equal(receivedPath, '/v1/messages');
    assert.equal(receivedHeaders['x-api-key'], 'anthropic-key');
    assert.equal(receivedHeaders['anthropic-version'], '2023-06-01');
    assert.equal(receivedBody?.model, 'claude-sonnet-4-5');
    assert.equal(receivedBody?.stream, true);
    assert.deepEqual(receivedBody?.messages, [{
      role: 'user',
      content: [{ type: 'text', text: 'hello' }],
    }]);
    assert.equal((reported[0] as LanguageModelTextPart).value, 'hello');
  } finally {
    server.close();
  }
});

test('adds the v1 segment for Anthropic Grok providers configured at the origin root', async () => {
  let receivedPath = '';
  const server = http.createServer((req, res) => {
    receivedPath = req.url ?? '';
    req.resume();
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end('event: message_stop\ndata: {"type":"message_stop"}\n\n');
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const provider: ProviderConfig = {
    id: 'yuzGrok',
    displayName: 'yuzGrok',
    baseUrl: `http://127.0.0.1:${address.port}`,
    apiKey: 'grok-key',
    apiStyle: 'anthropic',
    models: [],
  };

  try {
    await sendChatRequest(
      provider,
      { id: 'grok-4.5', name: 'Grok 4.5' },
      {
        id: 'yuzGrok::grok-4.5',
        name: 'Grok 4.5',
        family: 'grok',
        version: '',
        maxInputTokens: 500000,
        maxOutputTokens: 64000,
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

    assert.equal(receivedPath, '/v1/messages');
  } finally {
    server.close();
  }
});

test('passes Anthropic thinking display and parallel tool settings from model config', async () => {
  let receivedBody: Record<string, any> | undefined;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      receivedBody = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end('event: message_stop\ndata: {"type":"message_stop"}\n\n');
    });
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const provider: ProviderConfig = {
    id: 'anthropic',
    displayName: 'Anthropic',
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    apiKey: 'anthropic-key',
    apiStyle: 'anthropic',
    models: [],
  };

  try {
    await sendChatRequest(
      provider,
      {
        id: 'claude-sonnet-4-5',
        name: 'Claude Sonnet 4.5',
        supportsReasoning: true,
        defaultReasoningLevel: 'medium',
        anthropicThinkingDisplay: 'omitted',
        disableParallelToolUse: true,
      },
      {
        id: 'anthropic::claude-sonnet-4-5',
        name: 'Claude Sonnet 4.5',
        family: 'claude',
        version: '',
        maxInputTokens: 200000,
        maxOutputTokens: 4096,
        capabilities: {},
      },
      [{
        role: vscodeMock.LanguageModelChatMessageRole.User,
        content: [new LanguageModelTextPart('hello')],
      }] as never,
      {
        toolMode: vscodeMock.LanguageModelChatToolMode.Required,
        tools: [{ name: 'search', inputSchema: { type: 'object', properties: {} } }],
      } as never,
      { report() {} },
      { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) } as never
    );

    assert.deepEqual(receivedBody?.thinking, {
      type: 'enabled',
      budget_tokens: 1638,
      display: 'omitted',
    });
    assert.deepEqual(receivedBody?.tool_choice, {
      type: 'any',
      disable_parallel_tool_use: true,
    });
  } finally {
    server.close();
  }
});

test('retries temporary Anthropic upstream failures before surfacing an error', async () => {
  let requestCount = 0;
  const server = http.createServer((req, res) => {
    requestCount += 1;
    req.resume();
    if (requestCount === 1) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: {
          type: 'overloaded_error',
          message: 'Overloaded',
        },
      }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end([
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok"}}',
      '',
      'event: message_stop',
      'data: {"type":"message_stop"}',
      '',
    ].join('\n'));
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const provider: ProviderConfig = {
    id: 'anthropic',
    displayName: 'Anthropic',
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    apiKey: 'anthropic-key',
    apiStyle: 'anthropic',
    models: [],
  };
  const reported: unknown[] = [];

  try {
    await sendChatRequest(
      provider,
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
      {
        id: 'anthropic::claude-sonnet-4-5',
        name: 'Claude Sonnet 4.5',
        family: 'claude',
        version: '',
        maxInputTokens: 200000,
        maxOutputTokens: 4096,
        capabilities: {},
      },
      [{
        role: vscodeMock.LanguageModelChatMessageRole.User,
        content: [new LanguageModelTextPart('hello')],
      }] as never,
      { toolMode: 0 } as never,
      { report(part: unknown) { reported.push(part); } },
      { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) } as never
    );

    assert.equal(requestCount, 2);
    assert.equal((reported[0] as LanguageModelTextPart).value, 'ok');
  } finally {
    server.close();
  }
});

test('preserves Anthropic upstream error details after retries are exhausted', async () => {
  const server = http.createServer((req, res) => {
    req.resume();
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: {
        type: 'overloaded_error',
        message: 'model overloaded',
        request_id: 'req_123',
      },
    }));
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const provider: ProviderConfig = {
    id: 'anthropic',
    displayName: 'Anthropic',
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    apiKey: 'anthropic-key',
    apiStyle: 'anthropic',
    models: [],
  };

  try {
    await assert.rejects(
      sendChatRequest(
        provider,
        { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
        {
          id: 'anthropic::claude-sonnet-4-5',
          name: 'Claude Sonnet 4.5',
          family: 'claude',
          version: '',
          maxInputTokens: 200000,
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
      (error: Error) => {
        assert.match(error.message, /Anthropic API request failed \(HTTP 503/);
        assert.match(error.message, /overloaded_error/);
        assert.match(error.message, /req_123/);
        assert.match(error.message, /model overloaded/);
        return true;
      }
    );
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

test('does not expose upstream JSON message in temporary HTTP errors', async () => {
  const server = http.createServer((req, res) => {
    req.resume();
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: {
        message: 'No available accounts: no available accounts',
        type: 'api_error',
      },
    }));
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
    await assert.rejects(
      sendChatRequest(
        provider,
        {
          id: 'gemini-3.1-pro-preview',
          name: 'Gemini 3.1 Pro Preview',
          supportsReasoning: true,
          maxOutputTokens: 65536,
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
        { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) } as never
      ),
      (error: Error) => {
        assert.match(error.message, /上游模型服务暂时不可用 \(HTTP 503\)，请稍后重试。/);
        assert.doesNotMatch(error.message, /No available accounts/);
        return true;
      }
    );
  } finally {
    server.close();
  }
});

test('does not write Gemini failure diagnostics to disk', async () => {
  const diagnosticsPath = path.join(os.tmpdir(), 'cmb-gemini-last-request.json');
  await fs.rm(diagnosticsPath, { force: true });

  const server = http.createServer((req, res) => {
    req.resume();
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'temporary upstream failure' } }));
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
    await assert.rejects(
      sendChatRequest(
        provider,
        {
          id: 'gemini-3.1-pro-preview',
          name: 'Gemini 3.1 Pro Preview',
          supportsReasoning: true,
          maxOutputTokens: 65536,
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
        { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) } as never
      )
    );

    await assert.rejects(fs.stat(diagnosticsPath), { code: 'ENOENT' });
  } finally {
    await fs.rm(diagnosticsPath, { force: true });
    server.close();
  }
});

test('rejects an oversized image request before contacting the upstream provider', async () => {
  let requestCount = 0;
  const server = http.createServer((req, res) => {
    requestCount += 1;
    req.resume();
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end('data: [DONE]\n\n');
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const image = new Uint8Array(24);
  image.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(image.buffer);
  view.setUint32(16, 2048);
  view.setUint32(20, 1024);

  try {
    await assert.rejects(
      sendChatRequest(
        {
          id: 'openai',
          displayName: 'OpenAI',
          baseUrl: `http://127.0.0.1:${address.port}/v1`,
          apiKey: 'key',
          apiStyle: 'responses',
          models: [],
        },
        {
          id: 'gpt-5.6-sol',
          name: 'GPT 5.6 Sol',
          supportsVision: true,
          maxOutputTokens: 128,
        },
        {
          id: 'openai::gpt-5.6-sol',
          name: 'GPT 5.6 Sol',
          family: 'gpt',
          version: '',
          maxInputTokens: 1024,
          maxOutputTokens: 128,
          capabilities: { imageInput: true },
        },
        [{
          role: vscodeMock.LanguageModelChatMessageRole.User,
          content: [new LanguageModelDataPart(image, 'image/png')],
        }] as never,
        { toolMode: 0 } as never,
        { report() {} },
        { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) } as never
      ),
      /estimated input tokens/i
    );

    assert.equal(requestCount, 0);
  } finally {
    server.close();
  }
});
