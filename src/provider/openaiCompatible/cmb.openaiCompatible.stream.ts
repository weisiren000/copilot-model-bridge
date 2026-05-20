import * as vscode from 'vscode';
import { DEEPSEEK_REASONING_MIME } from '../deepseek/cmb.deepseek.adapter';
import { OpenAIStreamChunk } from '../../types';

/**
 * 把一段 reasoning 文本以 LanguageModelThinkingPart 的形式回报给 VS Code，
 * 让 Copilot Chat UI 把它显示成可折叠的 thinking 区域。
 *
 * 返回 true 表示成功使用了 ThinkingPart；返回 false 时调用方应该退回到
 * DataPart 兜底，确保 history 中仍能携带 reasoning。
 */
export function reportThinkingPart(
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  value: string
): boolean {
  const ctor = (vscode as unknown as {
    LanguageModelThinkingPart?: new (value: string) => unknown;
  }).LanguageModelThinkingPart;
  if (!ctor) {
    return false;
  }
  try {
    progress.report(new ctor(value) as vscode.LanguageModelResponsePart);
    return true;
  } catch {
    return false;
  }
}

/** 判断历史消息中的某个 part 是否是 ThinkingPart（兼容运行时缺失的情况） */
export function isThinkingPart(part: unknown): part is { value: string | string[] } {
  const ctor = (vscode as unknown as {
    LanguageModelThinkingPart?: new (...args: unknown[]) => unknown;
  }).LanguageModelThinkingPart;
  return !!ctor && part instanceof (ctor as new (...args: unknown[]) => object);
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

  const activeToolCalls: Record<number, { id: string; name: string; arguments: string }> = {};
  let reasoningBuffer = '';
  let reasoningStreamed = false;

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
          const delta = chunk.choices?.[0]?.delta;

          if (delta?.content) {
            // Report each text fragment back to VS Code / Copilot Chat
            progress.report(new vscode.LanguageModelTextPart(delta.content));
          }
          if (delta?.reasoning_content) {
            reasoningBuffer += delta.reasoning_content;
            if (reportThinkingPart(progress, delta.reasoning_content)) {
              reasoningStreamed = true;
            }
          }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index;
              if (!activeToolCalls[idx]) {
                activeToolCalls[idx] = { id: tc.id || `call_${idx}`, name: tc.function?.name || '', arguments: '' };
              }
              if (tc.function?.arguments) {
                activeToolCalls[idx].arguments += tc.function.arguments;
              }
            }
          }
        } catch {
          // Malformed JSON line – skip it silently; don't break the stream
        }
      }
    }
  } finally {
    // 优先以 ThinkingPart 形式回报；如果当前 VS Code 不支持 ThinkingPart
    // 或运行时已有片段流过则直接用 DataPart 兜底，让 history 仍能携带
    // reasoning_content 用于多轮 replay。
    if (reasoningBuffer && !reasoningStreamed) {
      try {
        progress.report(new vscode.LanguageModelDataPart(
          new TextEncoder().encode(reasoningBuffer),
          DEEPSEEK_REASONING_MIME
        ));
      } catch {
        // 不让 reasoning DataPart 失败影响主流回报
      }
    }

    for (const key of Object.keys(activeToolCalls)) {
      const tc = activeToolCalls[Number(key)];
      let inputObj = {};
      if (tc.arguments) {
        try { inputObj = JSON.parse(tc.arguments); } catch { }
      }
      progress.report(new vscode.LanguageModelToolCallPart(tc.id, tc.name, inputObj));
    }
    // Ensure the reader is always released
    reader.releaseLock();
  }
}
