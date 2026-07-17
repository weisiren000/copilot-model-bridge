import * as vscode from 'vscode';
import { DEEPSEEK_REASONING_MIME } from '../../deepseek/cmb.deepseek.adapter';
import {
  GEMINI_THOUGHT_SIGNATURE_MIME,
  encodeGeminiThoughtSignatureData,
} from '../../gemini/cmb.gemini.adapter';
import { OpenAIStreamChunk } from '../../../types';
import { readOpenAIUsage, reportModelUsage } from '../cmb.openaiCompatible.usage';

export function reportReasoningDataPart(
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  value: string
): void {
  const normalizedValue = normalizeThinkingText(value);
  if (!normalizedValue) {
    return;
  }
  progress.report(new vscode.LanguageModelDataPart(
    new TextEncoder().encode(normalizedValue),
    DEEPSEEK_REASONING_MIME
  ));
}

export function normalizeThinkingText(value: string): string {
  return value
    .replace(/<!--\s*-->/g, '')
    .replace(/(^|[^*])\*\*(?=\S)([^\r\n]*?\S)\*\*(?!\*)/gm, '$1$2');
}

/** 判断历史消息中的某个 part 是否是 ThinkingPart（兼容运行时缺失的情况） */
export function isThinkingPart(part: unknown): part is { value: string | string[] } {
  return typeof part === 'object'
    && part !== null
    && part.constructor?.name === 'LanguageModelThinkingPart'
    && 'value' in part;
}

/** 从 ThinkingPart 中读取文本内容，兼容 string 与 string[] 两种形态 */
export function readThinkingValue(part: { value: string | string[] }): string {
  if (Array.isArray(part.value)) {
    return part.value.join('');
  }
  return typeof part.value === 'string' ? part.value : '';
}

/**
 * Read a streaming SSE (Server-Sent Events) body and report each text chunk
 * to VS Code via progress.report().
 *
 * The OpenAI streaming format sends lines like:
 *   data: {"choices":[{"delta":{"content":"Hello"}}]}
 * followed by a final:
 *   data: [DONE]
 */
export async function consumeSSEStream(
  body: ReadableStream<Uint8Array>,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  token: vscode.CancellationToken
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const activeToolCalls: Record<number, {
    id: string;
    name: string;
    arguments: string;
    thoughtSignature?: string;
  }> = {};
  const textThoughtSignatures: string[] = [];
  let reasoningBuffer = '';
  let taggedThoughtBuffer = '';
  let insideTaggedThought = false;

  try {
    while (true) {
      // Check for VS Code cancellation before reading next chunk
      if (token.isCancellationRequested) { break; }

      const { done, value } = await reader.read();
      if (done) { break; }

      // Decode the raw bytes and append to our line buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete lines delimited by newline
      const lines = buffer.split('\n');
      // Keep the last (potentially incomplete) line in the buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();

        // SSE data lines start with "data: "
        if (!trimmed.startsWith('data: ')) { continue; }
        const data = trimmed.slice('data: '.length);

        // The stream is done
        if (data === '[DONE]') { return; }

        try {
          const chunk: OpenAIStreamChunk = JSON.parse(data);
          const usage = readOpenAIUsage(chunk.usage);
          if (usage) {
            reportModelUsage(progress, usage);
          }
          const delta = chunk.choices?.[0]?.delta;

          if (delta?.content) {
            const parts = splitTaggedThoughtContent(
              delta.content,
              insideTaggedThought
            );
            insideTaggedThought = parts.insideThought;
            for (const part of parts.parts) {
              if (part.kind === 'thinking') {
                taggedThoughtBuffer += part.value;
              } else if (part.value) {
                progress.report(new vscode.LanguageModelTextPart(part.value));
              }
            }
          }
          if (delta?.reasoning_content) {
            reasoningBuffer += delta.reasoning_content;
          }
          if (delta?.reasoning) {
            reasoningBuffer += delta.reasoning;
          }
          const deltaThoughtSignature = readGoogleThoughtSignature(delta);
          if (delta?.tool_calls) {
            const firstToolCallIndex = findFirstToolCallIndex(delta.tool_calls);
            for (const tc of delta.tool_calls) {
              // 跳过 index 缺失的异常 tool_call 分片
              if (tc.index === undefined || tc.index === null) { continue; }
              const idx = tc.index;
              if (!activeToolCalls[idx]) {
                activeToolCalls[idx] = { id: tc.id || `call_${idx}`, name: tc.function?.name || '', arguments: '' };
              }
              if (tc.id) {
                activeToolCalls[idx].id = tc.id;
              }
              if (tc.function?.name) {
                activeToolCalls[idx].name = tc.function.name;
              }
              if (tc.function?.arguments) {
                activeToolCalls[idx].arguments += tc.function.arguments;
              }
              const thoughtSignature = readGoogleThoughtSignature(tc);
              if (thoughtSignature) {
                activeToolCalls[idx].thoughtSignature = thoughtSignature;
              }
            }
            if (deltaThoughtSignature !== undefined && firstToolCallIndex !== undefined) {
              activeToolCalls[firstToolCallIndex].thoughtSignature = deltaThoughtSignature;
            }
          }
          if (deltaThoughtSignature && !delta?.tool_calls) {
            textThoughtSignatures.push(deltaThoughtSignature);
          }
        } catch {
          // Malformed JSON line – skip it silently; don't break the stream
        }
      }
    }
  } finally {
    // Stable Provider API does not expose ThinkingPart. Preserve reasoning in a
    // DataPart so it can still be replayed in later turns.
    const fallbackReasoning = normalizeThinkingText(reasoningBuffer || taggedThoughtBuffer);
    if (fallbackReasoning) {
      try {
        reportReasoningDataPart(progress, fallbackReasoning);
      } catch {
        // 不让 reasoning DataPart 失败影响主流回报
      }
    }

    for (const key of Object.keys(activeToolCalls)) {
      const tc = activeToolCalls[Number(key)];
      // 保护：当 tc.index 为 undefined 时，Number(key) 得到 NaN，tc 可能为 undefined
      if (!tc) { continue; }
      let inputObj = {};
      if (tc.arguments) {
        try { inputObj = JSON.parse(tc.arguments); } catch { }
      }
      if (tc.thoughtSignature) {
        reportGeminiThoughtSignature(progress, {
          toolCallId: tc.id,
          thoughtSignature: tc.thoughtSignature,
        });
      }
      progress.report(new vscode.LanguageModelToolCallPart(tc.id, tc.name, inputObj));
    }
    for (const thoughtSignature of textThoughtSignatures) {
      reportGeminiThoughtSignature(progress, { thoughtSignature });
    }
    // Ensure the reader is always released
    reader.releaseLock();
  }
}

function reportGeminiThoughtSignature(
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  data: { thoughtSignature: string; toolCallId?: string }
): void {
  try {
    progress.report(new vscode.LanguageModelDataPart(
      encodeGeminiThoughtSignatureData(data),
      GEMINI_THOUGHT_SIGNATURE_MIME
    ));
  } catch {
    // 签名旁路不能影响正常文本或 tool call 回报。
  }
}

function readGoogleThoughtSignature(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const extraContent = value.extra_content;
  if (!isRecord(extraContent)) {
    return undefined;
  }
  const google = extraContent.google;
  if (!isRecord(google)) {
    return undefined;
  }
  return typeof google.thought_signature === 'string'
    ? google.thought_signature
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function findFirstToolCallIndex(
  toolCalls: Array<{ index?: number | null }>
): number | undefined {
  for (const toolCall of toolCalls) {
    if (toolCall.index !== undefined && toolCall.index !== null) {
      return toolCall.index;
    }
  }
  return undefined;
}

function splitTaggedThoughtContent(
  value: string,
  insideThought: boolean
): {
  insideThought: boolean;
  parts: Array<{ kind: 'text' | 'thinking'; value: string }>;
} {
  const parts: Array<{ kind: 'text' | 'thinking'; value: string }> = [];
  let cursor = 0;
  let thinking = insideThought;

  while (cursor < value.length) {
    const tag = thinking ? '</think>' : '<think>';
    const index = value.indexOf(tag, cursor);
    const end = index === -1 ? value.length : index;
    const segment = value.slice(cursor, end);
    if (segment) {
      parts.push({ kind: thinking ? 'thinking' : 'text', value: segment });
    }
    if (index === -1) {
      cursor = value.length;
    } else {
      thinking = !thinking;
      cursor = index + tag.length;
    }
  }

  return { insideThought: thinking, parts };
}
