import {
  EditToolName,
  ImageDetail,
  ModelConfig,
  ReasoningLevel,
  ToolChoiceMode,
} from '../../types';

const DEFAULT_INPUT_TOKENS = 128000;
const DEFAULT_OUTPUT_TOKENS = 4096;
const DEFAULT_REASONING_LEVEL: ReasoningLevel = 'medium';
const DEFAULT_TOOL_CHOICE_MODE: ToolChoiceMode = 'required';
const DEFAULT_MULTIPLIER = '0x';
const VALID_REASONING_LEVELS: readonly ReasoningLevel[] = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
const VALID_TOOL_CHOICE_MODES: readonly ToolChoiceMode[] = ['auto', 'required', 'none', 'omit'];
const VALID_IMAGE_DETAILS: readonly ImageDetail[] = ['low', 'high', 'auto', 'original'];
const VALID_EDIT_TOOLS: readonly EditToolName[] = [
  'find-replace',
  'multi-find-replace',
  'apply-patch',
  'code-rewrite',
];

type RawModelConfig = Partial<ModelConfig> & Pick<ModelConfig, 'id' | 'name'>;
type LegacyModelConfig = RawModelConfig & { contextWindowTokens?: unknown };

export function normalizeModelConfig(model: LegacyModelConfig): ModelConfig {
  const {
    contextWindowTokens: _legacyContextWindowTokens,
    imageDetail: rawImageDetail,
    ...modelWithoutLegacyContext
  } = model;
  const cleanModel = modelWithoutLegacyContext as RawModelConfig;
  const supportsReasoning = shouldSupportReasoning(cleanModel);
  const supportsToolCalling = cleanModel.supportsToolCalling ?? true;
  const supportsEditTools = supportsToolCalling && (cleanModel.supportsEditTools ?? true);
  const defaultReasoningLevel = normalizeDefaultReasoningLevel(cleanModel.defaultReasoningLevel, supportsReasoning);
  const maxOutputTokens = normalizePositiveInteger(cleanModel.maxOutputTokens, DEFAULT_OUTPUT_TOKENS);
  const maxInputTokens = normalizePositiveInteger(cleanModel.maxInputTokens, DEFAULT_INPUT_TOKENS);
  const imageDetail = normalizeImageDetail(rawImageDetail);

  return {
    ...modelWithoutLegacyContext,
    id: cleanModel.id,
    name: cleanModel.name,
    maxInputTokens,
    maxOutputTokens,
    supportsToolCalling,
    supportsVision: cleanModel.supportsVision ?? false,
    ...(imageDetail ? { imageDetail } : {}),
    supportsVideo: cleanModel.supportsVideo ?? false,
    supportsFileInput: cleanModel.supportsFileInput ?? false,
    supportsEditTools,
    preferredEditTools: normalizeEditTools(cleanModel.preferredEditTools),
    toolChoiceMode: normalizeToolChoiceMode(cleanModel.toolChoiceMode),
    supportsReasoning,
    supportedReasoningLevels: normalizeSupportedReasoningLevels(
      cleanModel.supportedReasoningLevels,
      supportsReasoning,
      defaultReasoningLevel
    ),
    defaultReasoningLevel,
    multiplier: normalizeMultiplierLabel(cleanModel.multiplier),
    multiplierNumeric: normalizeMultiplierNumeric(cleanModel.multiplierNumeric),
  };
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
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
    return defaultReasoningLevel ? [defaultReasoningLevel] : undefined;
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

function normalizeImageDetail(value: unknown): ImageDetail | undefined {
  return typeof value === 'string' && VALID_IMAGE_DETAILS.includes(value as ImageDetail)
    ? value as ImageDetail
    : undefined;
}

function normalizeMultiplierLabel(multiplier: unknown): string {
  return typeof multiplier === 'string' && multiplier.trim() ? multiplier.trim() : DEFAULT_MULTIPLIER;
}

function normalizeMultiplierNumeric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}
