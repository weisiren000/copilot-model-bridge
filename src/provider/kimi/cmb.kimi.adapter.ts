import { ModelConfig, ReasoningLevel } from '../../types';

export type KimiModelKind = 'k3' | 'k2.7-code' | 'k2.6' | 'k2.5';

type KimiReasoningModel = Pick<
  ModelConfig,
  | 'id'
  | 'supportsReasoning'
  | 'supportedReasoningLevels'
  | 'defaultReasoningLevel'
>;

export function getKimiModelKind(modelId: string): KimiModelKind | undefined {
  const normalized = modelId.trim().toLowerCase().split('/').pop() ?? '';
  if (/^kimi-k3(?:$|[-_.:])/.test(normalized)) {
    return 'k3';
  }
  if (/^kimi-k2\.7-code(?:$|[-_.:])/.test(normalized)) {
    return 'k2.7-code';
  }
  if (/^kimi-k2\.6(?:$|[-_.:])/.test(normalized)) {
    return 'k2.6';
  }
  if (/^kimi-k2\.5(?:$|[-_.:])/.test(normalized)) {
    return 'k2.5';
  }
  return undefined;
}

export function normalizeKimiReasoningModel<T extends KimiReasoningModel>(model: T): T {
  const kind = getKimiModelKind(model.id);
  if (!kind) {
    return model;
  }

  if (kind === 'k3' || kind === 'k2.7-code') {
    return {
      ...model,
      supportsReasoning: true,
      supportedReasoningLevels: ['max'],
      defaultReasoningLevel: 'max',
    };
  }

  if (!model.supportsReasoning) {
    return model;
  }
  return {
    ...model,
    supportedReasoningLevels: ['none', 'max'],
    defaultReasoningLevel: model.defaultReasoningLevel === 'none' ? 'none' : 'max',
  };
}

export function applyKimiRequestPatch(
  requestBody: Record<string, unknown>,
  context: {
    modelId: string;
    supportsReasoning: boolean;
    reasoningLevel?: ReasoningLevel;
  }
): void {
  const kind = getKimiModelKind(context.modelId);
  if (!kind) {
    return;
  }

  const thinkingEnabled = kind === 'k3'
    || kind === 'k2.7-code'
    || (context.supportsReasoning && context.reasoningLevel !== 'none');

  if (kind === 'k3') {
    requestBody.reasoning_effort = 'max';
    delete requestBody.thinking;
  } else if (kind === 'k2.7-code') {
    delete requestBody.reasoning_effort;
    delete requestBody.thinking;
  } else if (kind === 'k2.6') {
    delete requestBody.reasoning_effort;
    requestBody.thinking = thinkingEnabled
      ? { type: 'enabled', keep: 'all' }
      : { type: 'disabled' };
  } else {
    delete requestBody.reasoning_effort;
    requestBody.thinking = { type: thinkingEnabled ? 'enabled' : 'disabled' };
  }

  if (kind !== 'k3' && requestBody.tool_choice === 'required') {
    requestBody.tool_choice = 'auto';
  }

  const preserveThinking = kind === 'k3'
    || kind === 'k2.7-code'
    || (kind === 'k2.6' && thinkingEnabled);
  normalizeKimiMessages(requestBody.messages, preserveThinking);
}

function normalizeKimiMessages(messages: unknown, preserveThinking: boolean): void {
  if (!Array.isArray(messages)) {
    return;
  }
  for (const message of messages) {
    if (!isRecord(message)) {
      continue;
    }
    const stashed = message.__reasoningContent;
    if (message.role === 'assistant' && preserveThinking && typeof stashed === 'string') {
      message.reasoning_content = stashed;
    } else if (!preserveThinking) {
      delete message.reasoning_content;
    }
    delete message.__reasoningContent;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
