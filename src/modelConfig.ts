import { EditToolName, ModelConfig, ReasoningLevel, ToolChoiceMode } from './types';

const DEFAULT_INPUT_TOKENS = 128000;
const DEFAULT_OUTPUT_TOKENS = 4096;
const DEFAULT_REASONING_LEVEL: ReasoningLevel = 'medium';
const DEFAULT_TOOL_CHOICE_MODE: ToolChoiceMode = 'required';
const DEFAULT_MULTIPLIER = '0x';
const VALID_REASONING_LEVELS: readonly ReasoningLevel[] = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
const VALID_TOOL_CHOICE_MODES: readonly ToolChoiceMode[] = ['auto', 'required', 'none', 'omit'];
const VALID_EDIT_TOOLS: readonly EditToolName[] = [
  'find-replace',
  'multi-find-replace',
  'apply-patch',
  'code-rewrite',
];

type RawModelConfig = Partial<ModelConfig> & Pick<ModelConfig, 'id' | 'name'>;

export function normalizeModelConfig(model: RawModelConfig): ModelConfig {
  const supportsReasoning = shouldSupportReasoning(model);
  const supportsToolCalling = model.supportsToolCalling ?? true;
  const supportsEditTools = supportsToolCalling && (model.supportsEditTools ?? true);
  const defaultReasoningLevel = normalizeDefaultReasoningLevel(model.defaultReasoningLevel, supportsReasoning);

  return {
    ...model,
    id: model.id,
    name: model.name,
    maxInputTokens: model.maxInputTokens ?? DEFAULT_INPUT_TOKENS,
    maxOutputTokens: model.maxOutputTokens ?? DEFAULT_OUTPUT_TOKENS,
    supportsToolCalling,
    supportsVision: model.supportsVision ?? false,
    supportsVideo: model.supportsVideo ?? false,
    supportsFileInput: model.supportsFileInput ?? false,
    supportsEditTools,
    preferredEditTools: normalizeEditTools(model.preferredEditTools),
    toolChoiceMode: normalizeToolChoiceMode(model.toolChoiceMode),
    supportsReasoning,
    supportedReasoningLevels: normalizeSupportedReasoningLevels(
      model.supportedReasoningLevels,
      supportsReasoning,
      defaultReasoningLevel
    ),
    defaultReasoningLevel,
    multiplier: normalizeMultiplierLabel(model.multiplier),
    multiplierNumeric: normalizeMultiplierNumeric(model.multiplierNumeric),
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

function normalizeEditTools(tools: unknown): EditToolName[] | undefined {
  if (!Array.isArray(tools)) {
    return undefined;
  }

  return tools
    .filter(isEditToolName)
    .filter((tool, index, values) => values.indexOf(tool) === index);
}

function isEditToolName(value: unknown): value is EditToolName {
  return typeof value === 'string' && VALID_EDIT_TOOLS.includes(value as EditToolName);
}

function normalizeToolChoiceMode(mode: unknown): ToolChoiceMode {
  return isToolChoiceMode(mode) ? mode : DEFAULT_TOOL_CHOICE_MODE;
}

function isToolChoiceMode(value: unknown): value is ToolChoiceMode {
  return typeof value === 'string' && VALID_TOOL_CHOICE_MODES.includes(value as ToolChoiceMode);
}

function normalizeMultiplierLabel(multiplier: unknown): string {
  return typeof multiplier === 'string' && multiplier.trim() ? multiplier.trim() : DEFAULT_MULTIPLIER;
}

function normalizeMultiplierNumeric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}
