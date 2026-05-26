import * as vscode from 'vscode';
import { ResponsesStreamEvent } from '../../../types';
import { DEEPSEEK_REASONING_MIME } from '../../deepseek/cmb.deepseek.adapter';
import { reportThinkingPart } from '../chatCompletions/cmb.chatCompletions.stream';

interface PendingFunctionCall {
  callId: string;
  name: string;
  arguments: string;
  reported: boolean;
}

export async function consumeResponsesSSEStream(
  body: ReadableStream<Uint8Array>,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  token: vscode.CancellationToken
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const calls = new Map<string, PendingFunctionCall>();
  let buffer = '';
  let reasoningBuffer = '';
  let reasoningStreamed = false;

  try {
    while (!token.isCancellationRequested) {
      const { done, value } = await reader.read();
      if (done) {
        handleBufferedFrame(buffer, calls, progress, value => {
          reasoningBuffer += value;
          reasoningStreamed = reportThinkingPart(progress, value) || reasoningStreamed;
        });
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        handleBufferedFrame(frame, calls, progress, value => {
          reasoningBuffer += value;
          reasoningStreamed = reportThinkingPart(progress, value) || reasoningStreamed;
        });
      }
    }
  } finally {
    if (reasoningBuffer && !reasoningStreamed) {
      progress.report(new vscode.LanguageModelDataPart(
        new TextEncoder().encode(reasoningBuffer),
        DEEPSEEK_REASONING_MIME
      ));
    }
    reader.releaseLock();
  }
}

function handleBufferedFrame(
  frame: string,
  calls: Map<string, PendingFunctionCall>,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  reportReasoning: (value: string) => void
): void {
  const event = parseFrame(frame);
  if (!event) {
    return;
  }
  handleEvent(event, calls, progress);
  if (isReasoningDeltaEvent(event) && event.delta) {
    reportReasoning(event.delta);
  }
  if (event.type === 'response.failed' || event.type === 'response.incomplete') {
    throw new Error(readResponseError(event));
  }
}

function isReasoningDeltaEvent(event: ResponsesStreamEvent): boolean {
  return event.type === 'response.reasoning_summary_text.delta'
    || event.type === 'response.reasoning_text.delta';
}

function parseFrame(frame: string): ResponsesStreamEvent | undefined {
  const dataLines = frame
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('data: '))
    .map(line => line.slice('data: '.length));

  if (dataLines.length === 0) {
    return undefined;
  }

  const data = dataLines.join('\n');
  if (data === '[DONE]') {
    return { type: 'response.completed' };
  }

  try {
    return JSON.parse(data) as ResponsesStreamEvent;
  } catch {
    return undefined;
  }
}

function handleEvent(
  event: ResponsesStreamEvent,
  calls: Map<string, PendingFunctionCall>,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>
): void {
  if (event.type === 'response.output_text.delta' && event.delta) {
    progress.report(new vscode.LanguageModelTextPart(event.delta));
    return;
  }

  if (event.type === 'response.output_item.added' || event.type === 'response.output_item.done') {
    trackFunctionCall(event, calls);
  }

  if (event.type === 'response.function_call_arguments.delta') {
    appendFunctionArguments(event, calls);
    return;
  }

  if (event.type === 'response.function_call_arguments.done') {
    appendFunctionArguments(event, calls);
    reportFunctionCall(event, calls, progress);
  }

  if (event.type === 'response.output_item.done') {
    reportFunctionCall(event, calls, progress);
  }
}

function trackFunctionCall(
  event: ResponsesStreamEvent,
  calls: Map<string, PendingFunctionCall>
): void {
  if (event.item?.type !== 'function_call') {
    return;
  }

  const key = readCallKey(event);
  const current = calls.get(key);
  calls.set(key, {
    callId: event.item.call_id ?? current?.callId ?? key,
    name: event.item.name ?? current?.name ?? '',
    arguments: event.item.arguments ?? current?.arguments ?? '',
    reported: current?.reported ?? false,
  });
}

function appendFunctionArguments(
  event: ResponsesStreamEvent,
  calls: Map<string, PendingFunctionCall>
): void {
  const key = readCallKey(event);
  const current = calls.get(key) ?? {
    callId: event.call_id ?? key,
    name: event.name ?? '',
    arguments: '',
    reported: false,
  };

  calls.set(key, {
    ...current,
    arguments: event.arguments ?? `${current.arguments}${event.delta ?? ''}`,
  });
}

function reportFunctionCall(
  event: ResponsesStreamEvent,
  calls: Map<string, PendingFunctionCall>,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>
): void {
  const key = readCallKey(event);
  const call = calls.get(key);
  if (!call || call.reported) {
    return;
  }

  call.reported = true;
  progress.report(new vscode.LanguageModelToolCallPart(
    call.callId,
    call.name,
    safeParseArguments(call.arguments)
  ));
}

function readCallKey(event: ResponsesStreamEvent): string {
  if (event.item_id) {
    return event.item_id;
  }
  if (event.item?.id) {
    return event.item.id;
  }
  if (event.output_index !== undefined) {
    return `output:${event.output_index}`;
  }
  return event.call_id ?? 'call:0';
}

function safeParseArguments(value: string): object {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function readResponseError(event: ResponsesStreamEvent): string {
  return event.error?.message
    ?? event.response?.error?.message
    ?? `Responses API stream failed: ${event.type}`;
}
