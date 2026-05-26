import { ResponsesContentPart, ResponsesInputItem } from '../../../types';

interface ChatMessage {
  role: string;
  name?: string;
  content?: unknown;
  tool_calls?: Array<{
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }>;
  tool_call_id?: string;
}

export function convertToResponsesInput(
  messages: ChatMessage[]
): { instructions?: string; input: ResponsesInputItem[] } {
  const instructions: string[] = [];
  const input: ResponsesInputItem[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      const text = readTextContent(message.content);
      if (text) {
        instructions.push(text);
        continue;
      }
    }

    if (message.role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: message.tool_call_id ?? '',
        output: readTextContent(message.content) || 'Success',
      });
      continue;
    }

    if (message.role === 'assistant') {
      pushAssistantMessage(input, message);
      continue;
    }

    input.push({
      type: 'message',
      role: message.role === 'developer' ? 'developer' : 'user',
      content: convertContentParts(message.content, 'input'),
    });
  }

  return instructions.length > 0
    ? { instructions: instructions.join('\n'), input }
    : { input };
}

function pushAssistantMessage(input: ResponsesInputItem[], message: ChatMessage): void {
  const content = convertContentParts(message.content, 'output');
  if (content.length > 0) {
    input.push({ type: 'message', role: 'assistant', content });
  }

  for (const toolCall of message.tool_calls ?? []) {
    input.push({
      type: 'function_call',
      call_id: toolCall.id ?? '',
      name: toolCall.function?.name ?? '',
      arguments: toolCall.function?.arguments ?? '{}',
    });
  }
}

function convertContentParts(value: unknown, mode: 'input' | 'output'): ResponsesContentPart[] {
  if (typeof value === 'string') {
    return value ? [createTextPart(value, mode)] : [];
  }
  if (!Array.isArray(value)) {
    return [];
  }

  const parts: ResponsesContentPart[] = [];
  for (const part of value) {
    const contentPart = part as { type?: unknown; text?: unknown; image_url?: { url?: unknown } };
    if (contentPart.type === 'text' && typeof contentPart.text === 'string') {
      parts.push(createTextPart(contentPart.text, mode));
    } else if (
      contentPart.type === 'image_url'
      && typeof contentPart.image_url?.url === 'string'
    ) {
      parts.push({ type: 'input_image', image_url: contentPart.image_url.url });
    }
  }
  return parts;
}

function createTextPart(text: string, mode: 'input' | 'output'): ResponsesContentPart {
  return mode === 'output'
    ? { type: 'output_text', text }
    : { type: 'input_text', text };
}

function readTextContent(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (!Array.isArray(value)) {
    return '';
  }
  return value
    .map(part => {
      const contentPart = part as { type?: unknown; text?: unknown };
      return contentPart.type === 'text' && typeof contentPart.text === 'string'
        ? contentPart.text
        : '';
    })
    .join('');
}
