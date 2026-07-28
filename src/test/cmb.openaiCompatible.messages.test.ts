import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import { DEEPSEEK_REASONING_MIME } from '../provider/deepseek/cmb.deepseek.adapter';
import { GEMINI_THOUGHT_SIGNATURE_MIME } from '../provider/gemini/cmb.gemini.adapter';

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
    readonly content: readonly unknown[]
  ) {}
}

class LanguageModelThinkingPart {
  constructor(readonly value: string | string[]) {}
}

const vscodeMock = {
  LanguageModelChatMessageRole: {
    User: 1,
    Assistant: 2,
  },
  LanguageModelDataPart,
  LanguageModelTextPart,
  LanguageModelThinkingPart,
  LanguageModelToolCallPart,
  LanguageModelToolResultPart,
};

const moduleLoader = Module as unknown as {
  _load(
    request: string,
    parent: unknown,
    isMain: boolean
  ): unknown;
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
  convertMessages,
  toTokenEstimateParts,
} = require('../provider/openaiCompatible/chatCompletions/cmb.chatCompletions.messages') as typeof import('../provider/openaiCompatible/chatCompletions/cmb.chatCompletions.messages');

test('normalizes token estimate parts including nested tool results', () => {
  const parts = [
    new LanguageModelTextPart('hello'),
    new LanguageModelDataPart(new Uint8Array([1, 2]), 'image/png'),
    new LanguageModelToolCallPart('call-1', 'read_file', { path: 'README.md' }),
    new LanguageModelToolResultPart('call-1', [
      new LanguageModelTextPart('result'),
      { ok: true },
    ]),
  ];

  assert.deepEqual(toTokenEstimateParts(parts), [
    { type: 'text', text: 'hello' },
    { type: 'data', data: new Uint8Array([1, 2]), mimeType: 'image/png' },
    { type: 'toolCall', name: 'read_file', input: { path: 'README.md' } },
    {
      type: 'toolResult',
      callId: 'call-1',
      content: [
        { type: 'text', text: 'result' },
        { type: 'text', text: '{"ok":true}' },
      ],
    },
  ]);
});

test('converts text and image user messages to OpenAI-compatible content', () => {
  const messages = [{
    role: vscodeMock.LanguageModelChatMessageRole.User,
    name: undefined,
    content: [
      new LanguageModelTextPart('look'),
      new LanguageModelDataPart(new Uint8Array([255]), 'image/png'),
    ],
  }];

  assert.deepEqual(convertMessages(messages, {}), [{
    role: 'user',
    content: [
      { type: 'text', text: 'look' },
      {
        type: 'image_url',
        image_url: {
          url: 'data:image/png;base64,/w==',
        },
      },
    ],
  }]);
});

test('preserves image data from tool results as multimodal user input', () => {
  const messages = [
    {
      role: vscodeMock.LanguageModelChatMessageRole.Assistant,
      name: undefined,
      content: [
        new LanguageModelToolCallPart('call-image', 'view_image', { filePath: 'preview.png' }),
      ],
    },
    {
      role: vscodeMock.LanguageModelChatMessageRole.User,
      name: undefined,
      content: [
        new LanguageModelToolResultPart('call-image', [
          new LanguageModelTextPart('Image attached.'),
          new LanguageModelDataPart(new Uint8Array([255]), 'image/png'),
        ]),
      ],
    },
  ];

  assert.deepEqual(convertMessages(messages, {}), [
    {
      role: 'assistant',
      content: null,
      tool_calls: [{
        id: 'call-image',
        type: 'function',
        function: {
          name: 'view_image',
          arguments: '{"filePath":"preview.png"}',
        },
      }],
    },
    {
      role: 'tool',
      tool_call_id: 'call-image',
      name: 'view_image',
      content: 'Image attached.',
    },
    {
      role: 'user',
      content: [{
        type: 'image_url',
        image_url: {
          url: 'data:image/png;base64,/w==',
        },
      }],
    },
  ]);
});

test('keeps all parallel tool results before replaying their images', () => {
  const messages = [
    {
      role: vscodeMock.LanguageModelChatMessageRole.Assistant,
      name: undefined,
      content: [
        new LanguageModelToolCallPart('call-1', 'view_image', { filePath: 'first.png' }),
        new LanguageModelToolCallPart('call-2', 'view_image', { filePath: 'second.png' }),
      ],
    },
    {
      role: vscodeMock.LanguageModelChatMessageRole.User,
      name: undefined,
      content: [
        new LanguageModelToolResultPart('call-1', [
          new LanguageModelDataPart(new Uint8Array([1]), 'image/png'),
        ]),
        new LanguageModelToolResultPart('call-2', [
          new LanguageModelDataPart(new Uint8Array([2]), 'image/png'),
        ]),
      ],
    },
  ];

  const converted = convertMessages(messages, {});

  assert.deepEqual(converted.map(message => message.role), [
    'assistant',
    'tool',
    'tool',
    'user',
  ]);
  assert.equal(converted[3].content.length, 2);
});

test('describes unknown binary tool results instead of failing the request', () => {
  const messages = [
    {
      role: vscodeMock.LanguageModelChatMessageRole.Assistant,
      name: undefined,
      content: [
        new LanguageModelToolCallPart('call-binary', 'read_asset', { path: 'asset.bin' }),
      ],
    },
    {
      role: vscodeMock.LanguageModelChatMessageRole.User,
      name: undefined,
      content: [
        new LanguageModelToolResultPart('call-binary', [
          new LanguageModelDataPart(new Uint8Array([1, 2, 3]), 'application/octet-stream'),
        ]),
      ],
    },
  ];

  const converted = convertMessages(messages, {});

  assert.equal(
    converted[1].content,
    '[Binary tool result omitted: application/octet-stream, 3 bytes]'
  );
});

test('converts assistant tool calls and following tool results', () => {
  const messages = [
    {
      role: vscodeMock.LanguageModelChatMessageRole.Assistant,
      name: undefined,
      content: [
        new LanguageModelToolCallPart('call-1', 'read_file', { path: 'README.md' }),
      ],
    },
    {
      role: vscodeMock.LanguageModelChatMessageRole.User,
      name: undefined,
      content: [
        new LanguageModelToolResultPart('call-1', [
          new LanguageModelTextPart('file contents'),
        ]),
      ],
    },
  ];

  assert.deepEqual(convertMessages(messages, {}), [
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
});

test('injects Gemini thought signatures into matching tool calls', () => {
  const messages = [
    {
      role: vscodeMock.LanguageModelChatMessageRole.Assistant,
      name: undefined,
      content: [
        new LanguageModelDataPart(
          new TextEncoder().encode(JSON.stringify({
            toolCallId: 'call-1',
            thoughtSignature: 'sig-1',
          })),
          GEMINI_THOUGHT_SIGNATURE_MIME
        ),
        new LanguageModelToolCallPart('call-1', 'read_file', { path: 'README.md' }),
      ],
    },
  ];

  assert.deepEqual(convertMessages(messages, {}), [
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
        extra_content: {
          google: {
            thought_signature: 'sig-1',
          },
        },
      }],
    },
  ]);
});

test('injects dummy thought signature for Gemini tool calls without history signatures', () => {
  const messages = [
    {
      role: vscodeMock.LanguageModelChatMessageRole.Assistant,
      name: undefined,
      content: [
        new LanguageModelToolCallPart('call-1', 'read_file', { path: 'README.md' }),
      ],
    },
  ];

  assert.deepEqual(convertMessages(messages, { isGemini: true }), [
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
        extra_content: {
          google: {
            thought_signature: 'skip_thought_signature_validator',
          },
        },
      }],
    },
  ]);
});

test('does not inject dummy thought signature for non-Gemini providers', () => {
  const messages = [
    {
      role: vscodeMock.LanguageModelChatMessageRole.Assistant,
      name: undefined,
      content: [
        new LanguageModelToolCallPart('call-1', 'read_file', { path: 'README.md' }),
      ],
    },
  ];

  assert.deepEqual(convertMessages(messages, {}), [
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
  ]);
});

test('preserves DeepSeek reasoning content from thinking and data parts', () => {
  const messages = [{
    role: vscodeMock.LanguageModelChatMessageRole.Assistant,
    name: undefined,
    content: [
      new LanguageModelTextPart('answer'),
      new LanguageModelThinkingPart(['think ', 'hard']),
      new LanguageModelDataPart(
        new TextEncoder().encode(' and replay'),
        DEEPSEEK_REASONING_MIME
      ),
    ],
  }];

  assert.deepEqual(convertMessages(messages, {}), [{
    role: 'assistant',
    content: 'answer',
    __reasoningContent: 'think hard and replay',
  }]);
});

test('preserves thinking when the VS Code runtime minifies the constructor name', () => {
  const RuntimeThinkingPart = class Ki {
    constructor(readonly value: string | string[]) {}
  };
  const previousThinkingPart = vscodeMock.LanguageModelThinkingPart;
  vscodeMock.LanguageModelThinkingPart = RuntimeThinkingPart;

  try {
    const messages = [{
      role: vscodeMock.LanguageModelChatMessageRole.Assistant,
      name: undefined,
      content: [
        new RuntimeThinkingPart('inspect the next file'),
        new LanguageModelToolCallPart('call-1', 'read_file', { path: 'README.md' }),
      ],
    }];

    assert.deepEqual(convertMessages(messages as never, {}), [{
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
      __reasoningContent: 'inspect the next file',
    }]);
  } finally {
    vscodeMock.LanguageModelThinkingPart = previousThinkingPart;
  }
});
