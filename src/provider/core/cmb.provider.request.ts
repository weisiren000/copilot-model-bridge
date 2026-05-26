import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveReasoningLevel } from '../openaiCompatible';
import {
  buildChatRequestBody,
  consumeSSEStream,
  convertMessages,
} from '../openaiCompatible/chatCompletions';
import { buildChatRequestHeaders } from '../openaiCompatible/cmb.openaiCompatible.requestHeaders';
import { postStreaming } from '../openaiCompatible/cmb.openaiCompatible.chatHttpClient';
import {
  buildResponsesRequestBody,
  buildResponsesToolOptions,
  consumeResponsesSSEStream,
  convertToResponsesInput,
} from '../openaiCompatible/responses';
import {
  applyReasoningContentReplay,
  buildDeepSeekRequestPatch,
  DeepSeekRequestContext,
  getDeepSeekMaxOutputTokens,
  isDeepSeekRequest,
} from '../deepseek/cmb.deepseek.adapter';
import {
  buildGeminiRequestPatch,
  GeminiToolDefinition,
  isGeminiRequest,
} from '../gemini/cmb.gemini.adapter';
import { ProviderConfig, ReasoningLevel, ToolChoiceMode } from '../../types';

export async function sendChatRequest(
  provider: ProviderConfig,
  selectedModel: {
    id: string;
    name: string;
    supportsVideo?: boolean;
    supportsFileInput?: boolean;
    supportsVision?: boolean;
    supportsReasoning?: boolean;
    defaultReasoningLevel?: ReasoningLevel;
    supportedReasoningLevels?: ReasoningLevel[];
    toolChoiceMode?: ToolChoiceMode;
  },
  model: vscode.LanguageModelChatInformation,
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  options: vscode.ProvideLanguageModelChatResponseOptions,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  token: vscode.CancellationToken
): Promise<void> {
  const apiMessages = convertMessages(messages, {
    supportsVideo: selectedModel.supportsVideo,
    supportsFileInput: selectedModel.supportsFileInput,
  });
  if (hasImageInput(messages) && !selectedModel.supportsVision) {
    throw new Error(
      `Model "${selectedModel.name}" does not support vision/image input. ` +
      `Please switch to a model with supportsVision=true.`
    );
  }

  const modelConfiguration = readModelConfiguration(options);
  if (resolveApiStyle(provider) === 'responses') {
    await sendResponsesRequest({
      provider,
      selectedModel,
      model,
      apiMessages,
      options,
      progress,
      token,
      modelConfiguration,
    });
    return;
  }

  await sendChatCompletionsRequest({
    provider,
    selectedModel,
    model,
    apiMessages,
    options,
    progress,
    token,
    modelConfiguration,
  });
}

interface RequestContext {
  provider: ProviderConfig;
  selectedModel: {
    id: string;
    name: string;
    supportsReasoning?: boolean;
    defaultReasoningLevel?: ReasoningLevel;
    supportedReasoningLevels?: ReasoningLevel[];
    toolChoiceMode?: ToolChoiceMode;
  };
  model: vscode.LanguageModelChatInformation;
  apiMessages: Array<any>;
  options: vscode.ProvideLanguageModelChatResponseOptions;
  progress: vscode.Progress<vscode.LanguageModelResponsePart>;
  token: vscode.CancellationToken;
  modelConfiguration?: { readonly [name: string]: unknown };
}

async function sendChatCompletionsRequest(context: RequestContext): Promise<void> {
  const {
    provider,
    selectedModel,
    model,
    apiMessages,
    options,
    progress,
    token,
    modelConfiguration,
  } = context;
  const requestUrl = `${provider.baseUrl}/chat/completions`;
  const isDeepSeek = isDeepSeekRequest(provider, selectedModel.id);
  const isGemini = isGeminiRequest(provider, selectedModel.id);
  const requestBody = buildChatRequestBody({
    modelId: selectedModel.id,
    messages: apiMessages,
    maxOutputTokens: resolveRequestMaxTokens(model.maxOutputTokens, isDeepSeek),
    supportsReasoning: selectedModel.supportsReasoning,
    defaultReasoningLevel: selectedModel.defaultReasoningLevel,
    supportedReasoningLevels: selectedModel.supportedReasoningLevels,
    toolChoiceMode: selectedModel.toolChoiceMode,
    responseOptions: options,
    modelConfiguration,
  });

  if (isGemini) {
    applyGeminiRequestPatch(requestBody);
  }

  if (isDeepSeek) {
    applyDeepSeekRequestPatch(requestBody, {
      supportsReasoning: !!selectedModel.supportsReasoning,
      hasTools: Boolean(options.tools && options.tools.length > 0),
      reasoningLevel: requestBody.reasoning_effort as ReasoningLevel | undefined,
    });
  }

  await postAndConsumeStream({
    provider,
    requestUrl,
    requestBody,
    progress,
    token,
    isGemini,
    consume: consumeSSEStream,
  });
}

async function sendResponsesRequest(context: RequestContext): Promise<void> {
  const {
    provider,
    selectedModel,
    model,
    apiMessages,
    options,
    progress,
    token,
    modelConfiguration,
  } = context;
  const requestUrl = `${provider.baseUrl}/responses`;
  const responsesInput = convertToResponsesInput(apiMessages);
  const reasoningEffort = selectedModel.supportsReasoning
    ? resolveReasoningLevel(
      options.modelOptions,
      modelConfiguration,
      selectedModel.defaultReasoningLevel ?? 'medium',
      selectedModel.supportedReasoningLevels
    )
    : undefined;
  const requestBody = buildResponsesRequestBody({
    modelId: selectedModel.id,
    input: responsesInput.input,
    instructions: responsesInput.instructions,
    maxOutputTokens: resolveRequestMaxTokens(model.maxOutputTokens, false),
    reasoningEffort,
    toolOptions: buildResponsesToolOptions(options, selectedModel.toolChoiceMode),
  });

  await postAndConsumeStream({
    provider,
    requestUrl,
    requestBody,
    progress,
    token,
    isGemini: false,
    consume: consumeResponsesSSEStream,
  });
}

interface PostStreamOptions {
  provider: ProviderConfig;
  requestUrl: string;
  requestBody: Record<string, unknown>;
  progress: vscode.Progress<vscode.LanguageModelResponsePart>;
  token: vscode.CancellationToken;
  isGemini: boolean;
  consume: (
    body: ReadableStream<Uint8Array>,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken
  ) => Promise<void>;
}

async function postAndConsumeStream(options: PostStreamOptions): Promise<void> {
  const abortController = new AbortController();
  const cancelSub = options.token.onCancellationRequested(() => abortController.abort());
  try {
    const response = await postStreaming(
      options.requestUrl,
      buildChatRequestHeaders(options.provider),
      options.requestBody,
      abortController.signal
    );
    if (!response.ok) {
      const errorText = await response.text();
      if (options.isGemini) {
        await writeGeminiFailureDiagnostics(
          options.requestUrl,
          response.status,
          errorText,
          options.requestBody
        );
      }
      throw new Error(`API request to ${options.requestUrl} failed with status ${response.status}: ${errorText}`);
    }
    if (!response.body) {
      throw new Error('Response body is null – the server did not return a streaming body.');
    }
    await options.consume(response.body, options.progress, options.token);
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new vscode.CancellationError();
    }
    throw err;
  } finally {
    cancelSub.dispose();
  }
}

function resolveApiStyle(provider: Pick<ProviderConfig, 'apiStyle'>): 'chat' | 'responses' {
  return provider.apiStyle === 'responses' ? 'responses' : 'chat';
}

async function writeGeminiFailureDiagnostics(
  requestUrl: string,
  status: number,
  responseText: string,
  requestBody: Record<string, unknown>
): Promise<void> {
  try {
    const diagnosticsPath = path.join(os.tmpdir(), 'cmb-gemini-last-request.json');
    const payload = {
      timestamp: new Date().toISOString(),
      requestUrl,
      status,
      responseText,
      requestBody,
    };
    await fs.writeFile(diagnosticsPath, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`[copilot-model-bridge] Gemini request diagnostics written to ${diagnosticsPath}`);
  } catch (err) {
    console.log('[copilot-model-bridge] Failed to write Gemini diagnostics', err);
  }
}

function applyGeminiRequestPatch(requestBody: Record<string, unknown>): void {
  const tools = requestBody.tools;
  const patch = buildGeminiRequestPatch({
    tools: Array.isArray(tools) ? tools as GeminiToolDefinition[] : undefined,
  });
  if (patch.tools) {
    requestBody.tools = patch.tools;
  }
}

function resolveRequestMaxTokens(maxOutputTokens: number, isDeepSeek: boolean): number {
  if (isDeepSeek) {
    return getDeepSeekMaxOutputTokens(maxOutputTokens);
  }
  if (!Number.isFinite(maxOutputTokens) || maxOutputTokens < 1) {
    return 1;
  }
  return Math.floor(maxOutputTokens);
}

function applyDeepSeekRequestPatch(
  requestBody: Record<string, unknown>,
  context: DeepSeekRequestContext
): void {
  const patch = buildDeepSeekRequestPatch(context);
  requestBody.thinking = patch.thinking;

  const thinkingEnabled = patch.thinking.type === 'enabled';
  if (thinkingEnabled) {
    requestBody.reasoning_effort = patch.reasoning_effort;
  } else {
    delete requestBody.reasoning_effort;
  }

  const messages = requestBody.messages;
  if (Array.isArray(messages)) {
    applyReasoningContentReplay(messages as Array<Record<string, unknown>>, thinkingEnabled);
  }
}

function readModelConfiguration(
  options: vscode.ProvideLanguageModelChatResponseOptions
): { readonly [name: string]: unknown } | undefined {
  const candidate = options as vscode.ProvideLanguageModelChatResponseOptions & {
    readonly modelConfiguration?: { readonly [name: string]: unknown };
    readonly configuration?: { readonly [name: string]: unknown };
  };
  return candidate.modelConfiguration ?? candidate.configuration;
}

function hasImageInput(messages: readonly vscode.LanguageModelChatRequestMessage[]): boolean {
  for (const message of messages) {
    for (const part of message.content) {
      if (part instanceof vscode.LanguageModelDataPart) {
        const mime = part.mimeType?.toLowerCase() ?? '';
        if (mime.startsWith('image/')) {
          return true;
        }
      }
    }
  }
  return false;
}
