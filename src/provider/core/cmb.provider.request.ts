import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveReasoningLevel, resolveToolChoice } from '../openaiCompatible';
import { convertMessages } from '../openaiCompatible/cmb.openaiCompatible.messages';
import { buildChatRequestHeaders } from '../openaiCompatible/cmb.openaiCompatible.requestHeaders';
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
  const modelConfiguration = readModelConfiguration(options);
  const isDeepSeek = isDeepSeekRequest(provider, selectedModel.id);
  const isGemini = isGeminiRequest(provider, selectedModel.id);
  const requestBody: Record<string, unknown> = {
    model: selectedModel.id,
    messages: apiMessages,
    stream: true,
    max_tokens: resolveRequestMaxTokens(model.maxOutputTokens, isDeepSeek),
  };

  if (selectedModel.supportsReasoning) {
    requestBody.reasoning_effort = resolveReasoningLevel(
      options.modelOptions,
      modelConfiguration,
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
      if (isGemini) {
        await writeGeminiFailureDiagnostics(requestUrl, response.status, errorText, requestBody);
      }
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
