import { EditToolName, ModelConfig, ReasoningLevel } from './types';

const REASONING_LEVELS: readonly ReasoningLevel[] = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
const EDIT_TOOLS: readonly EditToolName[] = [
  'find-replace',
  'multi-find-replace',
  'apply-patch',
  'code-rewrite',
];
const DEFAULT_EDIT_TOOLS: readonly EditToolName[] = [
  'find-replace',
  'multi-find-replace',
  'apply-patch',
];
const DEFAULT_REASONING_LEVEL: ReasoningLevel = 'medium';
const REASONING_LABELS: Record<ReasoningLevel, string> = {
  none: 'None',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Xhigh',
  max: 'Max',
};
const REASONING_DESCRIPTIONS: Record<ReasoningLevel, string> = {
  none: 'No reasoning applied',
  low: 'Faster responses with less reasoning',
  medium: 'Balanced reasoning and speed',
  high: 'Greater reasoning depth but slower',
  xhigh: 'Maximum reasoning depth but slower',
  max: 'Maximum available reasoning depth',
};

export interface OpenAITextContentPart {
  type: 'text';
  text: string;
}

export interface OpenAIImageContentPart {
  type: 'image_url';
  image_url: {
    url: string;
  };
}

export type OpenAIContent = string | null | Array<OpenAITextContentPart | OpenAIImageContentPart>;

export interface ModelCapabilities {
  toolCalling: boolean;
  imageInput: boolean;
  editTools?: EditToolName[];
}

export function createOpenAIImagePart(data: Uint8Array, mimeType: string): OpenAIImageContentPart {
  return {
    type: 'image_url',
    image_url: {
      url: `data:${mimeType};base64,${Buffer.from(data).toString('base64')}`,
    },
  };
}

export function buildOpenAIContent(
  text: string,
  images: OpenAIImageContentPart[]
): OpenAIContent {
  if (images.length === 0) {
    return text || null;
  }

  const content: Array<OpenAITextContentPart | OpenAIImageContentPart> = [];
  if (text) {
    content.push({ type: 'text', text });
  }
  content.push(...images);
  return content;
}

export function buildModelCapabilities(
  model: Partial<Pick<ModelConfig, 'supportsToolCalling' | 'supportsVision' | 'supportsEditTools' | 'preferredEditTools'>>
): ModelCapabilities {
  const supportsToolCalling = model.supportsToolCalling ?? true;
  const capabilities: ModelCapabilities = {
    toolCalling: supportsToolCalling,
    imageInput: model.supportsVision ?? false,
  };

  const supportsEditTools = model.supportsEditTools ?? supportsToolCalling;
  if (!supportsToolCalling || !supportsEditTools) {
    return capabilities;
  }

  const editTools = normalizeEditTools(model.preferredEditTools ?? DEFAULT_EDIT_TOOLS);
  if (editTools.length > 0) {
    capabilities.editTools = editTools;
  }
  return capabilities;
}

export function buildReasoningConfigurationSchema(
  defaultLevel: ReasoningLevel,
  supportedLevels: readonly ReasoningLevel[] = REASONING_LEVELS
): Record<string, unknown> {
  const levels = normalizeSupportedReasoningLevels(supportedLevels);
  const defaultValue = levels.includes(defaultLevel) ? defaultLevel : levels[0];

  return {
    properties: {
      reasoningEffort: {
        type: 'string',
        title: 'Thinking Effort',
        enum: levels,
        enumItemLabels: levels.map(level => REASONING_LABELS[level]),
        enumDescriptions: levels.map(level => REASONING_DESCRIPTIONS[level]),
        default: defaultValue,
        group: 'navigation',
      },
    },
  };
}

export function buildModelReasoningConfigurationSchema(
  model: Pick<ModelConfig, 'supportsReasoning' | 'supportedReasoningLevels' | 'defaultReasoningLevel'>
): Record<string, unknown> | undefined {
  if (!model.supportsReasoning) {
    return undefined;
  }

  return buildReasoningConfigurationSchema(
    model.defaultReasoningLevel ?? DEFAULT_REASONING_LEVEL,
    model.supportedReasoningLevels
  );
}

export function resolveReasoningLevel(
  modelOptions: { readonly [name: string]: unknown } | undefined,
  modelConfiguration: { readonly [name: string]: unknown } | undefined,
  modelDefault: ReasoningLevel,
  supportedLevels: readonly ReasoningLevel[] = REASONING_LEVELS
): ReasoningLevel {
  const levels = normalizeSupportedReasoningLevels(supportedLevels);
  const defaultLevel = levels.includes(modelDefault) ? modelDefault : levels[0];
  const level = readReasoningLevel(modelConfiguration) ?? readReasoningLevel(modelOptions);
  return isReasoningLevel(level) && levels.includes(level) ? level : defaultLevel;
}

function readReasoningLevel(options: { readonly [name: string]: unknown } | undefined): unknown {
  if (!options) {
    return undefined;
  }

  return options.reasoningEffort
    ?? options.reasoningLevel
    ?? options.reasoning_effort;
}

function isReasoningLevel(value: unknown): value is ReasoningLevel {
  return typeof value === 'string' && REASONING_LEVELS.includes(value as ReasoningLevel);
}

export function normalizeEditTools(tools: readonly unknown[] | undefined): EditToolName[] {
  return (tools ?? [])
    .filter(isEditToolName)
    .filter((tool, index, values) => values.indexOf(tool) === index);
}

function isEditToolName(value: unknown): value is EditToolName {
  return typeof value === 'string' && EDIT_TOOLS.includes(value as EditToolName);
}

function normalizeSupportedReasoningLevels(levels: readonly unknown[] | undefined): ReasoningLevel[] {
  const normalized = (levels ?? REASONING_LEVELS)
    .filter(isReasoningLevel)
    .filter((level, index, values) => values.indexOf(level) === index);

  return normalized.length > 0 ? normalized : [DEFAULT_REASONING_LEVEL];
}
