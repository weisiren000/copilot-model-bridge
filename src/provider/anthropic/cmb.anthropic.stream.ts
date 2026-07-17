import * as vscode from 'vscode';
import { reportReasoningDataPart } from '../openaiCompatible/chatCompletions/cmb.chatCompletions.stream';
import {
  readAnthropicUsage,
  reportModelUsage,
} from '../openaiCompatible/cmb.openaiCompatible.usage';
import {
  ANTHROPIC_CITATION_MIME,
  ANTHROPIC_MESSAGE_METADATA_MIME,
  ANTHROPIC_REDACTED_THINKING_MIME,
  ANTHROPIC_THINKING_SIGNATURE_MIME,
  ANTHROPIC_USAGE_MIME,
} from './cmb.anthropic.constants';

export {
  ANTHROPIC_CITATION_MIME,
  ANTHROPIC_MESSAGE_METADATA_MIME,
  ANTHROPIC_REDACTED_THINKING_MIME,
  ANTHROPIC_THINKING_SIGNATURE_MIME,
  ANTHROPIC_USAGE_MIME,
};

interface ActiveToolUse {
  id: string;
  name: string;
  arguments: string;
}

interface AnthropicUsageState {
  start?: Record<string, unknown>;
}

export async function consumeAnthropicSSEStream(
  body: ReadableStream<Uint8Array>,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  token: vscode.CancellationToken
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = '';
  const activeToolUses: Record<number, ActiveToolUse> = {};
  const usageState: AnthropicUsageState = {};

  try {
    while (true) {
      if (token.isCancellationRequested) {
        break;
      }
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        eventName = processAnthropicFrame(frame, eventName, activeToolUses, usageState, progress);
      }
    }
    if (buffer.trim()) {
      processAnthropicFrame(buffer, eventName, activeToolUses, usageState, progress);
    }
  } finally {
    reader.releaseLock();
  }
}

function processAnthropicFrame(
  frame: string,
  currentEventName: string,
  activeToolUses: Record<number, ActiveToolUse>,
  usageState: AnthropicUsageState,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>
): string {
  let eventName = currentEventName;
  const dataLines: string[] = [];
  for (const rawLine of frame.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim());
    }
  }
  if (dataLines.length === 0) {
    return eventName;
  }
  for (const data of dataLines) {
    handleAnthropicEvent(eventName, data, activeToolUses, usageState, progress);
  }
  return eventName;
}

function handleAnthropicEvent(
  eventName: string,
  data: string,
  activeToolUses: Record<number, ActiveToolUse>,
  usageState: AnthropicUsageState,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>
): void {
  const event = safeParseJson(data);
  if (!isRecord(event)) {
    return;
  }
  if (eventName === 'error' || event.type === 'error') {
    throw new Error(readStreamErrorMessage(event));
  }

  if (event.type === 'message_start') {
    handleMessageStart(event, usageState, progress);
    return;
  }
  if (event.type === 'message_delta') {
    handleMessageDelta(event, usageState, progress);
    return;
  }
  if (event.type === 'content_block_start') {
    handleContentBlockStart(event, activeToolUses, progress);
    return;
  }
  if (event.type === 'content_block_delta') {
    handleContentBlockDelta(event, activeToolUses, progress);
    return;
  }
  if (event.type === 'content_block_stop') {
    handleContentBlockStop(event, activeToolUses, progress);
  }
}

function handleContentBlockStart(
  event: Record<string, unknown>,
  activeToolUses: Record<number, ActiveToolUse>,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>
): void {
  const index = readIndex(event);
  const block = event.content_block;
  if (index === undefined || !isRecord(block)) {
    return;
  }
  if (block.type === 'redacted_thinking' && typeof block.data === 'string') {
    reportDataPart(progress, ANTHROPIC_REDACTED_THINKING_MIME, { data: block.data });
    return;
  }
  if (block.type !== 'tool_use') {
    return;
  }
  activeToolUses[index] = {
    id: typeof block.id === 'string' ? block.id : `toolu_${index}`,
    name: typeof block.name === 'string' ? block.name : '',
    arguments: '',
  };
  if (isRecord(block.input) && Object.keys(block.input).length > 0) {
    activeToolUses[index].arguments = JSON.stringify(block.input);
  }
}

function handleContentBlockDelta(
  event: Record<string, unknown>,
  activeToolUses: Record<number, ActiveToolUse>,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>
): void {
  const delta = event.delta;
  if (!isRecord(delta)) {
    return;
  }
  if (delta.type === 'text_delta' && typeof delta.text === 'string') {
    progress.report(new vscode.LanguageModelTextPart(delta.text));
    return;
  }
  if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
    reportReasoningDataPart(progress, delta.thinking);
    return;
  }
  if (delta.type === 'signature_delta' && typeof delta.signature === 'string') {
    reportDataPart(progress, ANTHROPIC_THINKING_SIGNATURE_MIME, {
      index: readIndex(event) ?? 0,
      signature: delta.signature,
    });
    return;
  }
  if (delta.type === 'citations_delta' && isRecord(delta.citation)) {
    reportDataPart(progress, ANTHROPIC_CITATION_MIME, {
      index: readIndex(event) ?? 0,
      citation: delta.citation,
    });
    return;
  }
  if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
    const index = readIndex(event);
    if (index !== undefined && activeToolUses[index]) {
      activeToolUses[index].arguments += delta.partial_json;
    }
  }
}

function handleContentBlockStop(
  event: Record<string, unknown>,
  activeToolUses: Record<number, ActiveToolUse>,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>
): void {
  const index = readIndex(event);
  if (index === undefined || !activeToolUses[index]) {
    return;
  }
  const toolUse = activeToolUses[index];
  delete activeToolUses[index];
  progress.report(new vscode.LanguageModelToolCallPart(
    toolUse.id,
    toolUse.name,
    parseToolInput(toolUse.arguments)
  ));
}

function parseToolInput(value: string): object {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function handleMessageStart(
  event: Record<string, unknown>,
  usageState: AnthropicUsageState,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>
): void {
  const message = event.message;
  if (!isRecord(message)) {
    return;
  }
  const metadata: Record<string, unknown> = {};
  if (typeof message.id === 'string') {
    metadata.id = message.id;
  }
  if (typeof message.model === 'string') {
    metadata.model = message.model;
  }
  if (Object.keys(metadata).length > 0) {
    reportDataPart(progress, ANTHROPIC_MESSAGE_METADATA_MIME, metadata);
  }
  if (isRecord(message.usage)) {
    reportDataPart(progress, ANTHROPIC_USAGE_MIME, message.usage);
    usageState.start = message.usage;
  }
}

function handleMessageDelta(
  event: Record<string, unknown>,
  usageState: AnthropicUsageState,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>
): void {
  if (isRecord(event.usage)) {
    reportDataPart(progress, ANTHROPIC_USAGE_MIME, event.usage);
    const usage = readAnthropicUsage(usageState.start, event.usage);
    if (usage) {
      reportModelUsage(progress, usage);
    }
  }
}

function reportDataPart(
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  mimeType: string,
  data: unknown
): void {
  progress.report(new vscode.LanguageModelDataPart(
    new TextEncoder().encode(JSON.stringify(data)),
    mimeType
  ));
}

function readIndex(event: Record<string, unknown>): number | undefined {
  return typeof event.index === 'number' ? event.index : undefined;
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function readStreamErrorMessage(event: Record<string, unknown>): string {
  const error = event.error;
  if (!isRecord(error)) {
    return 'Anthropic stream returned an error.';
  }
  const type = typeof error.type === 'string' ? error.type : 'error';
  const requestId = typeof error.request_id === 'string' ? error.request_id : undefined;
  const message = typeof error.message === 'string' ? error.message : 'Anthropic stream returned an error.';
  return requestId
    ? `${type} (${requestId}): ${message}`
    : `${type}: ${message}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
