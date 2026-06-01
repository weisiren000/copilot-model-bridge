import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';

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
  LanguageModelChatMessageRole: {
    User: 1,
    Assistant: 2,
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
  convertToAnthropicMessages,
} = require('../provider/anthropic/cmb.anthropic.messages') as typeof import('../provider/anthropic/cmb.anthropic.messages');

test('converts text and PDF user messages to Anthropic content blocks', () => {
  const messages = convertToAnthropicMessages([{
    role: vscodeMock.LanguageModelChatMessageRole.User,
    content: [
      new LanguageModelTextPart('read this'),
      new LanguageModelDataPart(new Uint8Array([37, 80, 68, 70]), 'application/pdf'),
    ],
  }] as never, {
    supportsFileInput: true,
  });

  assert.deepEqual(messages, [{
    role: 'user',
    content: [
      { type: 'text', text: 'read this' },
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: 'JVBERg==',
        },
      },
    ],
  }]);
});

test('converts tool calls and tool results to Anthropic history blocks', () => {
  const messages = convertToAnthropicMessages([
    {
      role: vscodeMock.LanguageModelChatMessageRole.User,
      content: [new LanguageModelTextPart('please inspect README')],
    },
    {
      role: vscodeMock.LanguageModelChatMessageRole.Assistant,
      content: [
        new LanguageModelTextPart('I will inspect it.'),
        new LanguageModelToolCallPart('toolu_1', 'read_file', { path: 'README.md' }),
      ],
    },
    {
      role: vscodeMock.LanguageModelChatMessageRole.User,
      content: [
        new LanguageModelToolResultPart('toolu_1', [new LanguageModelTextPart('file body')]),
      ],
    },
  ] as never, {});

  assert.deepEqual(messages, [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'please inspect README' },
      ],
    },
    {
      role: 'assistant',
      content: [
        { type: 'text', text: 'I will inspect it.' },
        { type: 'tool_use', id: 'toolu_1', name: 'read_file', input: { path: 'README.md' } },
      ],
    },
    {
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'toolu_1', content: 'file body' },
      ],
    },
  ]);
});

test('normalizes Anthropic messages by dropping leading assistant and merging adjacent roles', () => {
  const messages = convertToAnthropicMessages([
    {
      role: vscodeMock.LanguageModelChatMessageRole.Assistant,
      content: [new LanguageModelTextPart('trimmed assistant')],
    },
    {
      role: vscodeMock.LanguageModelChatMessageRole.User,
      content: [new LanguageModelTextPart('first user')],
    },
    {
      role: vscodeMock.LanguageModelChatMessageRole.User,
      content: [new LanguageModelTextPart('second user')],
    },
  ] as never, {});

  assert.deepEqual(messages, [{
    role: 'user',
    content: [
      { type: 'text', text: 'first user' },
      { type: 'text', text: 'second user' },
    ],
  }]);
});

test('keeps structured tool result content and maps error flags', () => {
  const toolResult = new LanguageModelToolResultPart('toolu_1', [
    new LanguageModelTextPart('failed screenshot'),
    new LanguageModelDataPart(new Uint8Array([1, 2, 3]), 'image/png'),
  ]) as LanguageModelToolResultPart & { isError: boolean };
  toolResult.isError = true;

  const messages = convertToAnthropicMessages([{
    role: vscodeMock.LanguageModelChatMessageRole.User,
    content: [toolResult],
  }] as never, {});

  assert.deepEqual(messages, [{
    role: 'user',
    content: [{
      type: 'tool_result',
      tool_use_id: 'toolu_1',
      is_error: true,
      content: [
        { type: 'text', text: 'failed screenshot' },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: 'AQID',
          },
        },
      ],
    }],
  }]);
});

test('round-trips Anthropic redacted thinking data parts into messages', () => {
  const {
    ANTHROPIC_REDACTED_THINKING_MIME,
  } = require('../provider/anthropic/cmb.anthropic.stream') as typeof import('../provider/anthropic/cmb.anthropic.stream');

  const messages = convertToAnthropicMessages([
    {
      role: vscodeMock.LanguageModelChatMessageRole.User,
      content: [new LanguageModelTextPart('previous question')],
    },
    {
      role: vscodeMock.LanguageModelChatMessageRole.Assistant,
      content: [
        new LanguageModelDataPart(
          new TextEncoder().encode(JSON.stringify({ data: 'opaque' })),
          ANTHROPIC_REDACTED_THINKING_MIME
        ),
      ],
    },
  ] as never, {});

  assert.deepEqual(messages, [
    {
      role: 'user',
      content: [{ type: 'text', text: 'previous question' }],
    },
    {
      role: 'assistant',
      content: [{ type: 'redacted_thinking', data: 'opaque' }],
    },
  ]);
});

test('applies cache control data parts to the next Anthropic content block', () => {
  const messages = convertToAnthropicMessages([{
    role: vscodeMock.LanguageModelChatMessageRole.User,
    content: [
      new LanguageModelDataPart(
        new TextEncoder().encode(JSON.stringify({ type: 'ephemeral', ttl: '5m' })),
        'cache_control'
      ),
      new LanguageModelDataPart(new Uint8Array([37, 80, 68, 70]), 'application/pdf'),
    ],
  }] as never, {});

  assert.deepEqual(messages, [{
    role: 'user',
    content: [{
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: 'JVBERg==',
      },
      cache_control: { type: 'ephemeral', ttl: '5m' },
    }],
  }]);
});
