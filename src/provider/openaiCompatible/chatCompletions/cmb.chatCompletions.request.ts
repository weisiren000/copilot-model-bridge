import * as vscode from 'vscode';
import { ReasoningLevel, ToolChoiceMode } from '../../../types';
import { resolveReasoningLevel } from '..';
import { buildChatToolOptions } from './cmb.chatCompletions.tools';

export interface ChatRequestOptions {
  modelId: string;
  messages: unknown[];
  maxOutputTokens: number;
  supportsReasoning?: boolean;
  defaultReasoningLevel?: ReasoningLevel;
  supportedReasoningLevels?: ReasoningLevel[];
  toolChoiceMode?: ToolChoiceMode;
  responseOptions: vscode.ProvideLanguageModelChatResponseOptions;
  modelConfiguration?: { readonly [name: string]: unknown };
}

export function buildChatRequestBody(options: ChatRequestOptions): Record<string, unknown> {
  const requestBody: Record<string, unknown> = {
    model: options.modelId,
    messages: options.messages,
    stream: true,
    max_tokens: options.maxOutputTokens,
  };

  if (options.supportsReasoning) {
    requestBody.reasoning_effort = resolveReasoningLevel(
      options.responseOptions.modelOptions,
      options.modelConfiguration,
      options.defaultReasoningLevel ?? 'medium',
      options.supportedReasoningLevels
    );
  }

  Object.assign(requestBody, buildChatToolOptions(
    options.responseOptions,
    options.toolChoiceMode
  ));

  return requestBody;
}
