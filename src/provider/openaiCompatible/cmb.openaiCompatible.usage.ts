import * as vscode from 'vscode';

export const MODEL_USAGE_MIME = 'usage';

export interface ModelUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: {
    cached_tokens: number;
    cache_creation_input_tokens?: number;
    anthropic_cache_creation?: {
      ephemeral_1h_input_tokens?: number;
      ephemeral_5m_input_tokens?: number;
    };
  };
  completion_tokens_details?: {
    reasoning_tokens: number;
    accepted_prediction_tokens: number;
    rejected_prediction_tokens: number;
  };
}

export function reportModelUsage(
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  usage: ModelUsage
): void {
  progress.report(new vscode.LanguageModelDataPart(
    new TextEncoder().encode(JSON.stringify(usage)),
    MODEL_USAGE_MIME
  ));
}

export function readOpenAIUsage(value: unknown): ModelUsage | undefined {
  const usage = asRecord(value);
  const promptTokens = readTokenCount(usage?.prompt_tokens);
  const completionTokens = readTokenCount(usage?.completion_tokens);
  if (promptTokens === undefined || completionTokens === undefined) {
    return undefined;
  }

  const result: ModelUsage = {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: readTokenCount(usage?.total_tokens) ?? promptTokens + completionTokens,
  };
  addPromptDetails(result, asRecord(usage?.prompt_tokens_details), 'cached_tokens');
  addCompletionDetails(result, asRecord(usage?.completion_tokens_details), 'reasoning_tokens');
  return result;
}

export function readResponsesUsage(value: unknown): ModelUsage | undefined {
  const usage = asRecord(value);
  const promptTokens = readTokenCount(usage?.input_tokens);
  const completionTokens = readTokenCount(usage?.output_tokens);
  if (promptTokens === undefined || completionTokens === undefined) {
    return undefined;
  }

  const result: ModelUsage = {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: readTokenCount(usage?.total_tokens) ?? promptTokens + completionTokens,
  };
  addPromptDetails(result, asRecord(usage?.input_tokens_details), 'cached_tokens');
  addCompletionDetails(result, asRecord(usage?.output_tokens_details), 'reasoning_tokens');
  return result;
}

export function readAnthropicUsage(
  startUsage: unknown,
  deltaUsage: unknown
): ModelUsage | undefined {
  const start = asRecord(startUsage);
  const delta = asRecord(deltaUsage);
  const inputTokens = readTokenCount(start?.input_tokens);
  const outputTokens = readTokenCount(delta?.output_tokens);
  if (inputTokens === undefined || outputTokens === undefined) {
    return undefined;
  }

  const cacheReadTokens = readTokenCount(start?.cache_read_input_tokens) ?? 0;
  const cacheCreationTokens = readTokenCount(start?.cache_creation_input_tokens) ?? 0;
  const promptTokens = inputTokens + cacheReadTokens + cacheCreationTokens;
  const result: ModelUsage = {
    prompt_tokens: promptTokens,
    completion_tokens: outputTokens,
    total_tokens: promptTokens + outputTokens,
  };
  if (cacheReadTokens > 0 || cacheCreationTokens > 0) {
    result.prompt_tokens_details = {
      cached_tokens: cacheReadTokens,
      cache_creation_input_tokens: cacheCreationTokens,
    };
    const cacheCreation = asRecord(start?.cache_creation);
    if (cacheCreation) {
      result.prompt_tokens_details.anthropic_cache_creation = {
        ephemeral_1h_input_tokens: readTokenCount(cacheCreation.ephemeral_1h_input_tokens),
        ephemeral_5m_input_tokens: readTokenCount(cacheCreation.ephemeral_5m_input_tokens),
      };
    }
  }
  return result;
}

function addPromptDetails(
  usage: ModelUsage,
  details: Record<string, unknown> | undefined,
  cachedKey: string
): void {
  if (!details) {
    return;
  }
  usage.prompt_tokens_details = {
    cached_tokens: readTokenCount(details[cachedKey]) ?? 0,
  };
}

function addCompletionDetails(
  usage: ModelUsage,
  details: Record<string, unknown> | undefined,
  reasoningKey: string
): void {
  if (!details) {
    return;
  }
  usage.completion_tokens_details = {
    reasoning_tokens: readTokenCount(details[reasoningKey]) ?? 0,
    accepted_prediction_tokens: readTokenCount(details.accepted_prediction_tokens) ?? 0,
    rejected_prediction_tokens: readTokenCount(details.rejected_prediction_tokens) ?? 0,
  };
}

function readTokenCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}