import { ModelConfig, ReasoningLevel } from './types';

const DEFAULT_INPUT_TOKENS = 128000;
const DEFAULT_OUTPUT_TOKENS = 4096;
const DEFAULT_REASONING_LEVEL: ReasoningLevel = 'medium';
const VALID_REASONING_LEVELS: readonly ReasoningLevel[] = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];

type RawModelConfig = Partial<ModelConfig> & Pick<ModelConfig, 'id' | 'name'>;

export function normalizeModelConfig(model: RawModelConfig): ModelConfig {
  const supportsReasoning = shouldSupportReasoning(model);
  const defaultReasoningLevel = normalizeDefaultReasoningLevel(model.defaultReasoningLevel, supportsReasoning);

  return {
    id: model.id,
    name: model.name,
    maxInputTokens: model.maxInputTokens ?? DEFAULT_INPUT_TOKENS,
    maxOutputTokens: model.maxOutputTokens ?? DEFAULT_OUTPUT_TOKENS,
    supportsToolCalling: model.supportsToolCalling ?? true,
    supportsVision: model.supportsVision ?? false,
    supportsReasoning,
    supportedReasoningLevels: normalizeSupportedReasoningLevels(
      model.supportedReasoningLevels,
      supportsReasoning,
      defaultReasoningLevel
    ),
    defaultReasoningLevel,
  };
}

function shouldSupportReasoning(model: Partial<ModelConfig>): boolean {
  if (model.supportsReasoning !== undefined) {
    return model.supportsReasoning;
  }
  return model.defaultReasoningLevel !== undefined;
}

function normalizeDefaultReasoningLevel(
  level: unknown,
  supportsReasoning: boolean
): ReasoningLevel | undefined {
  if (!supportsReasoning) {
    return undefined;
  }
  return isReasoningLevel(level) ? level : DEFAULT_REASONING_LEVEL;
}

function normalizeSupportedReasoningLevels(
  levels: unknown,
  supportsReasoning: boolean,
  defaultReasoningLevel: ReasoningLevel | undefined
): ReasoningLevel[] | undefined {
  if (!supportsReasoning) {
    return undefined;
  }
  if (!Array.isArray(levels)) {
    return undefined;
  }

  const normalized = levels
    .filter(isReasoningLevel)
    .filter((level, index, values) => values.indexOf(level) === index);

  if (normalized.length > 0) {
    return normalized;
  }
  return defaultReasoningLevel ? [defaultReasoningLevel] : undefined;
}

function isReasoningLevel(value: unknown): value is ReasoningLevel {
  return typeof value === 'string' && VALID_REASONING_LEVELS.includes(value as ReasoningLevel);
}
