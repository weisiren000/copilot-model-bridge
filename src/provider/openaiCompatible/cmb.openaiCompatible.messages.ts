import * as vscode from 'vscode';
import { decodeReasoningDataPart } from '../deepseek/cmb.deepseek.adapter';
import {
  buildOpenAIContent,
  createOpenAIDataPartContent,
  OpenAIContentPart,
} from './cmb.openaiCompatible.content';
import {
  TokenEstimatePart,
} from './cmb.openaiCompatible.token';
import { isThinkingPart, readThinkingValue } from './cmb.openaiCompatible.stream';

export function toTokenEstimateParts(
  parts: readonly vscode.LanguageModelInputPart[] | readonly unknown[]
): TokenEstimatePart[] {
  const result: TokenEstimatePart[] = [];

  for (const part of parts) {
    if (part instanceof vscode.LanguageModelTextPart) {
      result.push({ type: 'text', text: part.value });
    } else if (part instanceof vscode.LanguageModelDataPart) {
      result.push({ type: 'data', data: part.data, mimeType: part.mimeType });
    } else if (part instanceof vscode.LanguageModelToolCallPart) {
      result.push({ type: 'toolCall', name: part.name, input: part.input });
    } else if (part instanceof vscode.LanguageModelToolResultPart) {
      result.push({
        type: 'toolResult',
        callId: part.callId,
        content: toTokenEstimateParts(part.content),
      });
    } else if (typeof part === 'string') {
      result.push({ type: 'text', text: part });
    } else if (part !== undefined && part !== null) {
      result.push({ type: 'text', text: safeTokenText(part) });
    }
  }

  return result;
}

export function safeTokenText(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Convert VS Code LanguageModelChatRequestMessage[] to the OpenAI messages array,
 * including handling of ToolCalls and ToolResults.
 */
export function convertMessages(
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  attachmentPolicy: {
    supportsVideo?: boolean;
    supportsFileInput?: boolean;
  }
): Array<any> {
  const result: any[] = [];
  const toolCallIdToName: Record<string, string> = {};

  for (const msg of messages) {
    const role = msg.role === vscode.LanguageModelChatMessageRole.User ? 'user' : 'assistant';

    let textContent = '';
    const dataContent: OpenAIContentPart[] = [];
    const toolCalls: any[] = [];
    const toolResults: any[] = [];
    let reasoningContent = '';

    for (const part of msg.content) {
      if (part instanceof vscode.LanguageModelTextPart) {
        textContent += part.value;
      } else if (isThinkingPart(part)) {
        reasoningContent += readThinkingValue(part);
      } else if (part instanceof vscode.LanguageModelDataPart) {
        const reasoning = decodeReasoningDataPart(part.data, part.mimeType);
        if (reasoning !== undefined) {
          reasoningContent += reasoning;
          continue;
        }
        dataContent.push(...createOpenAIDataPartContent(part.data, part.mimeType, attachmentPolicy));
      } else if (part instanceof vscode.LanguageModelToolCallPart) {
        toolCallIdToName[part.callId] = part.name;
        toolCalls.push({
          id: part.callId,
          type: 'function',
          function: {
            name: part.name,
            arguments: typeof part.input === 'string' ? part.input : JSON.stringify(part.input)
          }
        });
      } else if (part instanceof vscode.LanguageModelToolResultPart) {
        let resultStr = '';
        for (const resPart of part.content) {
          if (resPart instanceof vscode.LanguageModelTextPart) {
            resultStr += resPart.value;
          } else if (typeof resPart === 'string') {
            resultStr += resPart;
          } else {
            try { resultStr += JSON.stringify(resPart); } catch { }
          }
        }
        const tr: any = {
          role: 'tool',
          tool_call_id: part.callId,
          content: resultStr || 'Success'
        };
        if (toolCallIdToName[part.callId]) {
          tr.name = toolCallIdToName[part.callId];
        }
        toolResults.push(tr);
      }
    }

    if (toolResults.length > 0) {
      for (const tr of toolResults) {
        result.push(tr);
      }
    }

    if (textContent || toolCalls.length > 0 || toolResults.length === 0) {
      const apiMsg: any = { role, content: buildOpenAIContent(textContent, dataContent) };
      if (toolCalls.length > 0) {
        apiMsg.tool_calls = toolCalls;
      }
      if (role === 'assistant' && reasoningContent) {
        apiMsg.__reasoningContent = reasoningContent;
      }
      // Avoid pushing empty assistant messages unless necessary or if no toolResults were mapped
      if (textContent || toolCalls.length > 0 || msg.role === vscode.LanguageModelChatMessageRole.User) {
        // Only skip empty assistant messages
        if (toolResults.length === 0 || textContent || toolCalls.length > 0) {
          if (msg.role !== vscode.LanguageModelChatMessageRole.User || toolResults.length === 0) {
            result.push(apiMsg);
          } else if (msg.role === vscode.LanguageModelChatMessageRole.User && textContent) {
            result.push(apiMsg);
          }
        }
      }
    }
  }
  return result;
}
