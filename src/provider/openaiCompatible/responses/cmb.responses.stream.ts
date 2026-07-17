import * as vscode from 'vscode';
import { ResponsesStreamEvent } from '../../../types';
import { DEEPSEEK_REASONING_MIME } from '../../deepseek/cmb.deepseek.adapter';
import { createStreamFailureError } from '../cmb.openaiCompatible.errors';
import { readResponsesUsage, reportModelUsage } from '../cmb.openaiCompatible.usage';
import {
  normalizeThinkingText,
} from '../chatCompletions/cmb.chatCompletions.stream';

interface PendingFunctionCall {
  callId: string;
  name: string;
  arguments: string;
  reported: boolean;
}

interface PendingReasoningItem {
  id?: string;
  text: string;
  reported: boolean;
}

type ReportReasoning = (value: string, id?: string) => void;

export async function consumeResponsesSSEStream(
  body: ReadableStream<Uint8Array>,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  token: vscode.CancellationToken
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const calls = new Map<string, PendingFunctionCall>();
  const reasoningItems = new Map<string, PendingReasoningItem>();
  let buffer = '';
  const fallbackReasoning: string[] = [];
  const reportReasoning: ReportReasoning = value => {
    const normalizedValue = normalizeThinkingText(value);
    if (!normalizedValue) {
      return;
    }
    fallbackReasoning.push(normalizedValue);
  };

  try {
    while (!token.isCancellationRequested) {
      const { done, value } = await reader.read();
      if (done) {
        handleBufferedFrame(buffer, calls, reasoningItems, progress, reportReasoning);
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        handleBufferedFrame(frame, calls, reasoningItems, progress, reportReasoning);
      }
    }
  } finally {
    flushReasoningItems(reasoningItems, reportReasoning);
    if (fallbackReasoning.length > 0) {
      progress.report(new vscode.LanguageModelDataPart(
        new TextEncoder().encode(fallbackReasoning.join('\n\n')),
        DEEPSEEK_REASONING_MIME
      ));
    }
    reader.releaseLock();
  }
}

function handleBufferedFrame(
  frame: string,
  calls: Map<string, PendingFunctionCall>,
  reasoningItems: Map<string, PendingReasoningItem>,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  reportReasoning: ReportReasoning
): void {
  const event = parseFrame(frame);
  if (!event) {
    return;
  }
  handleReasoningEvent(event, reasoningItems, reportReasoning);
  flushReasoningBeforeOutput(event, reasoningItems, reportReasoning);
  handleEvent(event, calls, progress);
  const usage = readResponsesUsage(event.response?.usage);
  if (usage) {
    reportModelUsage(progress, usage);
  }
  if (event.type === 'response.failed' || event.type === 'response.incomplete') {
    throw createStreamFailureError(readResponseError(event));
  }
}

function flushReasoningBeforeOutput(
  event: ResponsesStreamEvent,
  reasoningItems: Map<string, PendingReasoningItem>,
  reportReasoning: ReportReasoning
): void {
  if (!startsVisibleOutput(event)) {
    return;
  }
  flushReasoningItems(reasoningItems, reportReasoning);
}

function startsVisibleOutput(event: ResponsesStreamEvent): boolean {
  if (event.type === 'response.output_text.delta') {
    return true;
  }
  return event.type === 'response.output_item.added' && event.item?.type === 'function_call';
}

function handleReasoningEvent(
  event: ResponsesStreamEvent,
  reasoningItems: Map<string, PendingReasoningItem>,
  reportReasoning: ReportReasoning
): void {
  if (isReasoningDeltaEvent(event) && event.delta) {
    getReasoningItem(reasoningItems, event).text += event.delta;
    return;
  }

  const doneText = readReasoningDoneText(event);
  if (doneText) {
    getReasoningItem(reasoningItems, event).text = doneText;
    return;
  }

  if (event.type !== 'response.output_item.done' || event.item?.type !== 'reasoning') {
    return;
  }
  const item = getReasoningItem(reasoningItems, event);
  reportReasoningItem(item, readReasoningSummary(event), reportReasoning);
}

function isReasoningDeltaEvent(event: ResponsesStreamEvent): boolean {
  return event.type === 'response.reasoning_summary_text.delta'
    || event.type === 'response.reasoning_text.delta';
}

function readReasoningDoneText(event: ResponsesStreamEvent): string {
  if (
    event.type !== 'response.reasoning_summary_text.done'
    && event.type !== 'response.reasoning_text.done'
  ) {
    return '';
  }
  return typeof event.text === 'string' ? event.text : '';
}

function readReasoningSummary(event: ResponsesStreamEvent): string {
  if (
    event.type !== 'response.output_item.done'
    || event.item?.type !== 'reasoning'
    || !Array.isArray(event.item.summary)
  ) {
    return '';
  }

  return event.item.summary
    .map(part => typeof part.text === 'string' ? part.text : '')
    .filter(Boolean)
    .join('\n\n');
}

function getReasoningItem(
  items: Map<string, PendingReasoningItem>,
  event: ResponsesStreamEvent
): PendingReasoningItem {
  const key = readReasoningKey(event);
  const item = items.get(key) ?? { text: '', reported: false };
  item.id = event.item_id ?? event.item?.id ?? item.id;
  items.set(key, item);
  return item;
}

function readReasoningKey(event: ResponsesStreamEvent): string {
  if (event.output_index !== undefined) {
    return `output:${event.output_index}`;
  }
  return event.item_id ?? event.item?.id ?? 'reasoning:0';
}

function reportReasoningItem(
  item: PendingReasoningItem,
  summary: string,
  reportReasoning: ReportReasoning
): void {
  if (item.reported) {
    return;
  }
  item.reported = true;
  reportReasoning(summary || item.text, item.id);
}

function flushReasoningItems(
  items: Map<string, PendingReasoningItem>,
  reportReasoning: ReportReasoning
): void {
  for (const item of items.values()) {
    reportReasoningItem(item, '', reportReasoning);
  }
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
