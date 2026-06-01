import {
  AnthropicThinkingDisplay,
  AnthropicThinkingMode,
  ReasoningLevel,
} from '../../types';
import {
  AnthropicToolChoice,
  AnthropicToolDefinition,
} from './cmb.anthropic.tools';

export interface AnthropicMessageParam {
  role: 'user' | 'assistant';
  content: unknown;
}

export interface BuildAnthropicRequestBodyOptions {
  modelId: string;
  messages: AnthropicMessageParam[];
  maxOutputTokens: number;
  supportsReasoning?: boolean;
  reasoningLevel?: ReasoningLevel;
  thinkingDisplay?: AnthropicThinkingDisplay;
  thinkingMode?: AnthropicThinkingMode;
  toolOptions: {
    tools?: AnthropicToolDefinition[];
    tool_choice?: AnthropicToolChoice;
  };
}

export function buildAnthropicRequestBody(
  options: BuildAnthropicRequestBodyOptions
): Record<string, unknown> {
  const requestBody: Record<string, unknown> = {
    model: options.modelId,
    messages: options.messages,
    stream: true,
    max_tokens: normalizeMaxTokens(options.maxOutputTokens),
  };

  const thinking = buildAnthropicThinkingConfig(
    options.supportsReasoning,
    options.reasoningLevel,
    options.thinkingDisplay,
    requestBody.max_tokens as number,
    shouldSendAnthropicThinking(options.modelId, options.thinkingMode)
  );
  if (thinking) {
    requestBody.thinking = thinking;
  }

  if (options.toolOptions.tools) {
    requestBody.tools = options.toolOptions.tools;
  }
  if (options.toolOptions.tool_choice) {
    requestBody.tool_choice = options.toolOptions.tool_choice;
  }

  return requestBody;
}

export function buildAnthropicThinkingConfig(
  supportsReasoning: boolean | undefined,
  reasoningLevel: ReasoningLevel | undefined,
  thinkingDisplay: AnthropicThinkingDisplay | undefined,
  maxTokens: number,
  shouldSendThinking = true
): { type: 'enabled'; budget_tokens: number; display: AnthropicThinkingDisplay } | { type: 'disabled' } | undefined {
  if (!supportsReasoning) {
    return undefined;
  }
  if (!shouldSendThinking) {
    return undefined;
  }
  if (reasoningLevel === 'none') {
    return { type: 'disabled' };
  }
  if (maxTokens <= 1024) {
    return undefined;
  }
  const budget = Math.min(
    Math.max(1024, Math.floor(maxTokens * reasoningBudgetRatio(reasoningLevel ?? 'medium'))),
    maxTokens - 1
  );
  return {
    type: 'enabled',
    budget_tokens: budget,
    display: thinkingDisplay ?? 'summarized',
  };
}

function shouldSendAnthropicThinking(
  modelId: string,
  mode: AnthropicThinkingMode | undefined
): boolean {
  if (mode === 'enabled') {
    return true;
  }
  if (mode === 'disabled') {
    return false;
  }
  return isClaudeModelId(modelId);
}

function isClaudeModelId(modelId: string): boolean {
  return /(^|[/:_-])claude([/:_-]|$)/i.test(modelId);
}

function reasoningBudgetRatio(level: ReasoningLevel): number {
  switch (level) {
    case 'low':
      return 0.25;
    case 'high':
      return 0.5;
    case 'xhigh':
      return 0.7;
    case 'max':
      return 0.85;
    case 'medium':
      return 0.4;
    default:
      return 0.25;
  }
}

function normalizeMaxTokens(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}
