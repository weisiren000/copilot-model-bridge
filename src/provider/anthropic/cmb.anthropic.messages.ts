import * as vscode from 'vscode';
import { readThinkingValue, isThinkingPart } from '../openaiCompatible/chatCompletions/cmb.chatCompletions.stream';
import {
  AnthropicCacheControl,
  AnthropicContentBlock,
  AnthropicToolResultBlock,
  AnthropicToolUseBlock,
  createAnthropicTextBlock,
  createAnthropicDataPartContent,
} from './cmb.anthropic.content';

export interface ConvertAnthropicMessagesOptions {
  supportsVideo?: boolean;
  supportsFileInput?: boolean;
  enableDocumentCitations?: boolean;
}

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: AnthropicContentBlock[];
}

export function convertToAnthropicMessages(
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  options: ConvertAnthropicMessagesOptions
): AnthropicMessage[] {
  const result: AnthropicMessage[] = [];

  for (const message of messages) {
    const role = message.role === vscode.LanguageModelChatMessageRole.User ? 'user' : 'assistant';
    const contentBlocks: AnthropicContentBlock[] = [];
    let pendingCacheControl: AnthropicCacheControl | undefined;

    for (const part of message.content) {
      if (part instanceof vscode.LanguageModelTextPart) {
        pendingCacheControl = appendAnthropicBlocks(
          contentBlocks,
          [createAnthropicTextBlock(part.value)],
          pendingCacheControl
        );
      } else if (isThinkingPart(part)) {
        pendingCacheControl = appendAnthropicBlocks(
          contentBlocks,
          [createAnthropicTextBlock(readThinkingValue(part))],
          pendingCacheControl
        );
      } else if (part instanceof vscode.LanguageModelDataPart) {
        const cacheControl = decodeCacheControlDataPart(part);
        if (cacheControl) {
          pendingCacheControl = cacheControl;
          continue;
        }
        pendingCacheControl = appendAnthropicBlocks(
          contentBlocks,
          createAnthropicDataPartContent(part.data, part.mimeType, options),
          pendingCacheControl
        );
      } else if (part instanceof vscode.LanguageModelToolCallPart) {
        pendingCacheControl = appendAnthropicBlocks(
          contentBlocks,
          [toToolUseBlock(part)],
          pendingCacheControl
        );
      } else if (part instanceof vscode.LanguageModelToolResultPart) {
        result.push({
          role: 'user',
          content: [toToolResultBlock(part)],
        });
      }
    }

    if (contentBlocks.length > 0) {
      result.push({ role, content: contentBlocks });
    }
  }

  return normalizeAnthropicMessages(result);
}

function toToolUseBlock(part: vscode.LanguageModelToolCallPart): AnthropicToolUseBlock {
  return {
    type: 'tool_use',
    id: part.callId,
    name: part.name,
    input: typeof part.input === 'string' ? parseToolInput(part.input) : part.input,
  };
}

function toToolResultBlock(part: vscode.LanguageModelToolResultPart): AnthropicToolResultBlock {
  const contentBlocks: AnthropicContentBlock[] = [];
  let textContent = '';
  for (const item of part.content) {
    if (item instanceof vscode.LanguageModelTextPart) {
      textContent += item.value;
    } else if (typeof item === 'string') {
      textContent += item;
    } else if (item instanceof vscode.LanguageModelDataPart) {
      contentBlocks.push(...createAnthropicDataPartContent(item.data, item.mimeType, {}));
    } else {
      try {
        textContent += JSON.stringify(item);
      } catch {
        textContent += String(item);
      }
    }
  }
  const block: AnthropicToolResultBlock = {
    type: 'tool_result',
    tool_use_id: part.callId,
    content: buildToolResultContent(textContent, contentBlocks),
  };
  if (readToolResultErrorFlag(part)) {
    block.is_error = true;
  }
  return block;
}

function parseToolInput(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function buildToolResultContent(
  textContent: string,
  contentBlocks: AnthropicContentBlock[]
): string | AnthropicContentBlock[] {
  if (contentBlocks.length === 0) {
    return textContent || 'Success';
  }
  return textContent ? [createAnthropicTextBlock(textContent), ...contentBlocks] : contentBlocks;
}

function appendAnthropicBlocks(
  target: AnthropicContentBlock[],
  blocks: AnthropicContentBlock[],
  pendingCacheControl: AnthropicCacheControl | undefined
): AnthropicCacheControl | undefined {
  if (pendingCacheControl && blocks.length > 0) {
    blocks[0] = { ...blocks[0], cache_control: pendingCacheControl } as AnthropicContentBlock;
    pendingCacheControl = undefined;
  }
  target.push(...blocks);
  return pendingCacheControl;
}

function readToolResultErrorFlag(part: vscode.LanguageModelToolResultPart): boolean {
  const candidate = part as vscode.LanguageModelToolResultPart & {
    isError?: unknown;
    is_error?: unknown;
    error?: unknown;
  };
  return candidate.isError === true || candidate.is_error === true || candidate.error === true;
}

function normalizeAnthropicMessages(messages: AnthropicMessage[]): AnthropicMessage[] {
  const result: AnthropicMessage[] = [];

  for (const message of messages) {
    if (result.length === 0 && message.role !== 'user') {
      continue;
    }

    const previous = result[result.length - 1];
    if (previous?.role === message.role) {
      previous.content.push(...message.content);
      continue;
    }
    result.push({
      role: message.role,
      content: [...message.content],
    });
  }

  return result;
}

function decodeCacheControlDataPart(
  part: vscode.LanguageModelDataPart
): AnthropicCacheControl | undefined {
  if (part.mimeType?.toLowerCase() !== 'cache_control') {
    return undefined;
  }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(part.data)) as Partial<AnthropicCacheControl>;
    if (parsed.type !== 'ephemeral') {
      return { type: 'ephemeral' };
    }
    return parsed.ttl === '5m' || parsed.ttl === '1h'
      ? { type: 'ephemeral', ttl: parsed.ttl }
      : { type: 'ephemeral' };
  } catch {
    return { type: 'ephemeral' };
  }
}
