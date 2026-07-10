import * as vscode from 'vscode';
import {
  resolveOpenAIChatRequestPolicy,
  resolveReasoningLevel,
} from '../openaiCompatible';
import {
  buildChatRequestBody,
  consumeSSEStream,
  convertMessages,
} from '../openaiCompatible/chatCompletions';
import { buildChatRequestHeaders } from '../openaiCompatible/cmb.openaiCompatible.requestHeaders';
import { createHttpError } from '../openaiCompatible/cmb.openaiCompatible.errors';
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
  resolveGeminiOpenAICompatibleUrl,
} from '../gemini/cmb.gemini.adapter';
import { ModelConfig, ProviderConfig, ReasoningLevel } from '../../types';
import {
  buildAnthropicRequestBody,
  buildAnthropicRequestHeaders,
  buildAnthropicToolOptions,
  createAnthropicHttpError,
  consumeAnthropicSSEStream,
  convertToAnthropicMessages,
} from '../anthropic';

export async function sendChatRequest(
  provider: ProviderConfig,
  selectedModel: SelectedModel,
  model: vscode.LanguageModelChatInformation,
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  options: vscode.ProvideLanguageModelChatResponseOptions,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  token: vscode.CancellationToken
): Promise<void> {
  if (hasImageInput(messages) && !selectedModel.supportsVision) {
    throw new Error(
      `Model "${selectedModel.name}" does not support vision/image input. ` +
      `Please switch to a model with supportsVision=true.`
    );
  }

  const modelConfiguration = readModelConfiguration(options);
  if (resolveApiStyle(provider) === 'anthropic') {
    await sendAnthropicRequest({
      provider,
      selectedModel,
      model,
      messages,
      options,
      progress,
      token,
      modelConfiguration,
    });
    return;
  }

  const isGemini = isGeminiRequest(provider, selectedModel.id);
  const apiMessages = convertMessages(messages, {
    supportsVideo: selectedModel.supportsVideo,
    supportsFileInput: selectedModel.supportsFileInput,
    isGemini,
  });

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
  selectedModel: SelectedModel;
  model: vscode.LanguageModelChatInformation;
  apiMessages: Array<any>;
  options: vscode.ProvideLanguageModelChatResponseOptions;
  progress: vscode.Progress<vscode.LanguageModelResponsePart>;
  token: vscode.CancellationToken;
  modelConfiguration?: { readonly [name: string]: unknown };
}

interface AnthropicRequestContext {
  provider: ProviderConfig;
  selectedModel: SelectedModel;
  model: vscode.LanguageModelChatInformation;
  messages: readonly vscode.LanguageModelChatRequestMessage[];
  options: vscode.ProvideLanguageModelChatResponseOptions;
  progress: vscode.Progress<vscode.LanguageModelResponsePart>;
  token: vscode.CancellationToken;
  modelConfiguration?: { readonly [name: string]: unknown };
}

type SelectedModel = Pick<ModelConfig, 'id' | 'name'> & Partial<Pick<ModelConfig,
  | 'supportsVideo'
  | 'supportsFileInput'
  | 'supportsVision'
  | 'supportsReasoning'
  | 'defaultReasoningLevel'
  | 'supportedReasoningLevels'
  | 'includeThoughts'
  | 'enableDocumentCitations'
  | 'anthropicThinkingDisplay'
  | 'anthropicThinkingMode'
  | 'disableParallelToolUse'
  | 'toolChoiceMode'
  | 'maxOutputTokens'
>>;

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
  const isDeepSeek = isDeepSeekRequest(provider, selectedModel.id);
  const isGemini = isGeminiRequest(provider, selectedModel.id);
  const requestUrl = isGemini
    ? resolveGeminiOpenAICompatibleUrl(provider, 'chat/completions')
    : `${provider.baseUrl}/chat/completions`;
  const reasoningEffort = selectedModel.supportsReasoning
    ? resolveReasoningLevel(
      options.modelOptions,
      modelConfiguration,
      selectedModel.defaultReasoningLevel ?? 'medium',
      selectedModel.supportedReasoningLevels
    )
    : undefined;
  const chatPolicy = resolveOpenAIChatRequestPolicy({
    providerBaseUrl: provider.baseUrl,
    modelId: selectedModel.id,
  });
  const requestBody = buildChatRequestBody({
    modelId: selectedModel.id,
    messages: apiMessages,
    maxOutputTokens: resolveRequestMaxTokens(
      resolveConfiguredMaxOutputTokens(selectedModel, model),
      { isDeepSeek }
    ),
    supportsReasoning: selectedModel.supportsReasoning,
    defaultReasoningLevel: selectedModel.defaultReasoningLevel,
    supportedReasoningLevels: selectedModel.supportedReasoningLevels,
    reasoningEffortOverride: reasoningEffort,
    maxTokenField: chatPolicy.maxTokenField,
    toolChoiceMode: selectedModel.toolChoiceMode,
    responseOptions: options,
    modelConfiguration,
  });

  if (isGemini) {
    applyGeminiRequestPatch(requestBody, selectedModel.includeThoughts);
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
    maxOutputTokens: resolveRequestMaxTokens(resolveConfiguredMaxOutputTokens(selectedModel, model), {}),
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

async function sendAnthropicRequest(context: AnthropicRequestContext): Promise<void> {
  const {
    provider,
    selectedModel,
    model,
    messages,
    options,
    progress,
    token,
    modelConfiguration,
  } = context;
  const requestUrl = `${provider.baseUrl}/messages`;
  const anthropicMessages = convertToAnthropicMessages(messages, {
    supportsVideo: selectedModel.supportsVideo,
    supportsFileInput: selectedModel.supportsFileInput,
    enableDocumentCitations: selectedModel.enableDocumentCitations,
  });
  const reasoningLevel = selectedModel.supportsReasoning
    ? resolveReasoningLevel(
      options.modelOptions,
      modelConfiguration,
      selectedModel.defaultReasoningLevel ?? 'medium',
      selectedModel.supportedReasoningLevels
    )
    : undefined;
  const requestBody = buildAnthropicRequestBody({
    modelId: selectedModel.id,
    messages: anthropicMessages,
    maxOutputTokens: resolveRequestMaxTokens(resolveConfiguredMaxOutputTokens(selectedModel, model), {}),
    supportsReasoning: selectedModel.supportsReasoning,
    reasoningLevel,
    thinkingDisplay: selectedModel.anthropicThinkingDisplay,
    thinkingMode: selectedModel.anthropicThinkingMode,
    toolOptions: buildAnthropicToolOptions({
      tools: options.tools?.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
      requestedToolMode: options.toolMode === vscode.LanguageModelChatToolMode.Required ? 'required' : 'auto',
      toolChoiceMode: selectedModel.toolChoiceMode,
      disableParallelToolUse: selectedModel.disableParallelToolUse,
    }),
  });

  await postAndConsumeStream({
    provider,
    requestUrl,
    requestBody,
    progress,
    token,
    isGemini: false,
    headers: buildAnthropicRequestHeaders(provider),
    retry: { maxRetries: 2 },
    createHttpError: createAnthropicHttpError,
    consume: consumeAnthropicSSEStream,
  });
}

interface PostStreamOptions {
  provider: ProviderConfig;
  requestUrl: string;
  requestBody: Record<string, unknown>;
  progress: vscode.Progress<vscode.LanguageModelResponsePart>;
  token: vscode.CancellationToken;
  isGemini: boolean;
  headers?: Record<string, string>;
  retry?: {
    maxRetries: number;
  };
  createHttpError?: (
    requestUrl: string,
    status: number,
    responseText: string,
    headers?: Headers
  ) => Error;
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
    const maxRetries = options.retry?.maxRetries ?? 0;
    for (let attempt = 0; ; attempt += 1) {
      const response = await postStreaming(
        options.requestUrl,
        options.headers ?? buildChatRequestHeaders(options.provider),
        options.requestBody,
        abortController.signal
      );
      if (!response.ok) {
        const errorText = await response.text();
        if (shouldRetryResponse(response, attempt, maxRetries)) {
          await waitBeforeRetry(response, attempt, options.token);
          continue;
        }
        throw (options.createHttpError ?? createHttpError)(
          options.requestUrl,
          response.status,
          errorText,
          response.headers
        );
      }
      if (!response.body) {
        throw new Error('Response body is null – the server did not return a streaming body.');
      }
      await options.consume(response.body, options.progress, options.token);
      return;
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new vscode.CancellationError();
    }
    throw err;
  } finally {
    cancelSub.dispose();
  }
}

function shouldRetryResponse(response: Response, attempt: number, maxRetries: number): boolean {
  return attempt < maxRetries && isRetriableHttpStatus(response.status);
}

function isRetriableHttpStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

async function waitBeforeRetry(
  response: Response,
  attempt: number,
  token: vscode.CancellationToken
): Promise<void> {
  const delayMillis = readRetryAfterMillis(response.headers) ?? calculateRetryDelayMillis(attempt);
  if (delayMillis <= 0 || token.isCancellationRequested) {
    return;
  }
  await new Promise<void>(resolve => setTimeout(resolve, delayMillis));
}

function readRetryAfterMillis(headers: Headers): number | undefined {
  const retryAfterMillis = Number(headers.get('retry-after-ms'));
  if (Number.isFinite(retryAfterMillis) && retryAfterMillis >= 0) {
    return retryAfterMillis;
  }

  const retryAfter = headers.get('retry-after');
  if (!retryAfter) {
    return undefined;
  }
  const retryAfterSeconds = Number(retryAfter);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return retryAfterSeconds * 1000;
  }

  const retryAt = Date.parse(retryAfter);
  if (Number.isFinite(retryAt)) {
    return Math.max(0, retryAt - Date.now());
  }
  return undefined;
}

function calculateRetryDelayMillis(attempt: number): number {
  return Math.min(500 * (2 ** attempt), 8000);
}

function resolveApiStyle(provider: Pick<ProviderConfig, 'apiStyle'>): 'chat' | 'responses' | 'anthropic' {
  if (provider.apiStyle === 'responses' || provider.apiStyle === 'anthropic') {
    return provider.apiStyle;
  }
  return 'chat';
}

function applyGeminiRequestPatch(
  requestBody: Record<string, unknown>,
  includeThoughts: boolean | undefined
): void {
  const tools = requestBody.tools;
  const patch = buildGeminiRequestPatch({
    tools: Array.isArray(tools) ? tools as GeminiToolDefinition[] : undefined,
    includeThoughts: Boolean(includeThoughts),
  });
  if (patch.tools) {
    requestBody.tools = patch.tools;
  }
  if (patch.extra_body) {
    requestBody.extra_body = patch.extra_body;
  }
}

function resolveRequestMaxTokens(
  maxOutputTokens: number,
  options: { isDeepSeek?: boolean }
): number {
  if (options.isDeepSeek) {
    return getDeepSeekMaxOutputTokens(maxOutputTokens);
  }
  return normalizeRequestMaxTokens(maxOutputTokens);
}

function normalizeRequestMaxTokens(maxOutputTokens: number): number {
  if (!Number.isFinite(maxOutputTokens) || maxOutputTokens < 1) {
    return 1;
  }
  return Math.floor(maxOutputTokens);
}

function resolveConfiguredMaxOutputTokens(
  selectedModel: { maxOutputTokens?: number },
  model: vscode.LanguageModelChatInformation
): number {
  return selectedModel.maxOutputTokens ?? model.maxOutputTokens;
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
