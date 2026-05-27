import * as vscode from 'vscode';
import { decodeReasoningDataPart } from '../../deepseek/cmb.deepseek.adapter';
import {
  decodeGeminiThoughtSignatureDataPart,
  GEMINI_DUMMY_THOUGHT_SIGNATURE,
} from '../../gemini/cmb.gemini.adapter';
import {
  buildOpenAIContent,
  createOpenAIDataPartContent,
  OpenAIContentPart,
} from '../cmb.openaiCompatible.content';
import {
  TokenEstimatePart,
} from '../cmb.openaiCompatible.token';
import { isThinkingPart, readThinkingValue } from './cmb.chatCompletions.stream';

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
    /**
     * 当请求目标是 Gemini 时设为 true，重放 tool_calls 时如果历史里没有对应
     * thought_signature DataPart，会注入官方文档允许的 dummy 签名以避免 400。
     */
    isGemini?: boolean;
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
    const geminiToolCallSignatures = collectGeminiToolCallSignatures(msg.content);

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
        const geminiSignature = decodeGeminiThoughtSignatureDataPart(part.data, part.mimeType);
        if (geminiSignature !== undefined) {
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
        const thoughtSignature = geminiToolCallSignatures[part.callId];
        if (thoughtSignature) {
          toolCalls[toolCalls.length - 1].extra_content = {
            google: {
              thought_signature: thoughtSignature,
            },
          };
        } else if (attachmentPolicy.isGemini) {
          // Gemini 3 strict validation 要求当前 turn 内每个 step 的第一个
          // function call 必须带 thought_signature；缺签名直接报 400。
          // 历史里没有真签名时（旧会话、跨模型迁移），用官方文档允许的
          // dummy 值 skip_thought_signature_validator 兜底。
          toolCalls[toolCalls.length - 1].extra_content = {
            google: {
              thought_signature: GEMINI_DUMMY_THOUGHT_SIGNATURE,
            },
          };
        }
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

function collectGeminiToolCallSignatures(
  parts: readonly vscode.LanguageModelInputPart[] | readonly unknown[]
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of parts) {
    if (!(part instanceof vscode.LanguageModelDataPart)) {
      continue;
    }
    const data = decodeGeminiThoughtSignatureDataPart(part.data, part.mimeType);
    if (data?.toolCallId) {
      result[data.toolCallId] = data.thoughtSignature;
    }
  }
  return result;
}
