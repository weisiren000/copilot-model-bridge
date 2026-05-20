import * as vscode from 'vscode';
import { resolveReasoningLevel, resolveToolChoice } from '../openaiCompatible';
import { convertMessages } from '../openaiCompatible/cmb.openaiCompatible.messages';
import { buildChatRequestHeaders } from '../openaiCompatible/cmb.openaiCompatible.requestHeaders';
import {
  applyReasoningContentReplay,
  buildDeepSeekRequestPatch,
  DeepSeekRequestContext,
  isDeepSeekRequest,
} from '../deepseek/cmb.deepseek.adapter';
import { postStreamingChatCompletion } from '../openaiCompatible/cmb.openaiCompatible.chatHttpClient';
import { consumeSSEStream } from '../openaiCompatible/cmb.openaiCompatible.stream';
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

  const requestUrl = `${provider.baseUrl}/chat/completions`;
  const requestBody: Record<string, unknown> = {
    model: selectedModel.id,
    messages: apiMessages,
    stream: true,
    max_tokens: model.maxOutputTokens,
  };

  if (selectedModel.supportsReasoning) {
    requestBody.reasoning_effort = resolveReasoningLevel(
      options.modelOptions,
      readModelConfiguration(options),
      selectedModel.defaultReasoningLevel ?? 'medium',
      selectedModel.supportedReasoningLevels
    );
  }

  if (options.tools && options.tools.length > 0) {
    requestBody.tools = options.tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
    const toolChoice = resolveToolChoice({
      hasTools: true,
      requestedToolMode: options.toolMode === vscode.LanguageModelChatToolMode.Required ? 'required' : 'auto',
      toolChoiceMode: selectedModel.toolChoiceMode,
    });
    if (toolChoice !== undefined) {
      requestBody.tool_choice = toolChoice;
    }
  }

  if (isDeepSeekRequest(provider, selectedModel.id)) {
    applyDeepSeekRequestPatch(requestBody, {
      supportsReasoning: !!selectedModel.supportsReasoning,
      hasTools: Boolean(options.tools && options.tools.length > 0),
      reasoningLevel: requestBody.reasoning_effort as ReasoningLevel | undefined,
    });
  }

  const abortController = new AbortController();
  const cancelSub = token.onCancellationRequested(() => abortController.abort());
  try {
    const response = await postStreamingChatCompletion(
      requestUrl,
      buildChatRequestHeaders(provider),
      requestBody,
      abortController.signal
    );
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request to ${requestUrl} failed with status ${response.status}: ${errorText}`);
    }
    if (!response.body) {
      throw new Error('Response body is null – the server did not return a streaming body.');
    }
    await consumeSSEStream(response.body, progress, token);
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new vscode.CancellationError();
    }
    throw err;
  } finally {
    cancelSub.dispose();
  }
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
