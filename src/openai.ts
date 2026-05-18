import { EditToolName, ModelConfig, ReasoningLevel, ToolChoiceMode } from './types';

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
const APPROX_CHARS_PER_TOKEN = 4;
const IMAGE_TOKEN_ESTIMATE = 1024;
const COPILOT_METADATA_MIME_TYPES = new Set([
  'cache_control',
  'stateful_marker',
  'thinking',
  'context_management',
  'phase_data',
  'response_output_message_id',
]);
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

export type OpenAIContentPart = OpenAITextContentPart | OpenAIImageContentPart;

export type OpenAIContent = string | null | OpenAIContentPart[];

export interface AttachmentPolicy {
  supportsVideo?: boolean;
  supportsFileInput?: boolean;
}

export interface ModelCapabilities {
  toolCalling: boolean;
  imageInput: boolean;
  editTools?: EditToolName[];
}

export interface ModelBillingMetadata {
  multiplier: string;
  multiplierNumeric?: number;
}

export type RequestedToolMode = 'auto' | 'required' | 'none';

export interface ResolveToolChoiceOptions {
  hasTools: boolean;
  requestedToolMode?: RequestedToolMode;
  toolChoiceMode?: ToolChoiceMode;
}

export type TokenEstimatePart =
  | { type: 'text'; text: string }
  | { type: 'image'; byteLength: number }
  | { type: 'data'; mimeType?: string; data: Uint8Array }
  | { type: 'toolCall'; name: string; input: unknown }
  | { type: 'toolResult'; callId: string; content: readonly TokenEstimatePart[] };

export function createOpenAIImagePart(data: Uint8Array, mimeType: string): OpenAIImageContentPart {
  return {
    type: 'image_url',
    image_url: {
      url: `data:${mimeType};base64,${Buffer.from(data).toString('base64')}`,
    },
  };
}

export function createOpenAITextPart(text: string): OpenAITextContentPart {
  return { type: 'text', text };
}

export function createOpenAIDataPartContent(
  data: Uint8Array,
  mimeType: string | undefined,
  policy: AttachmentPolicy
): OpenAIContentPart[] {
  const normalizedMime = normalizeMimeType(mimeType);

  if (COPILOT_METADATA_MIME_TYPES.has(normalizedMime)) {
    return [];
  }

  if (normalizedMime.startsWith('image/')) {
    return [createOpenAIImagePart(data, normalizedMime)];
  }

  if (normalizedMime.startsWith('video/')) {
    if (policy.supportsVideo) {
      throw new Error(
        `Video attachments are not yet supported by OpenAI-compatible request conversion. MIME type: ${normalizedMime}.`
      );
    }
    throw new Error(
      `Video attachments are not supported by this model. MIME type: ${normalizedMime}.`
    );
  }

  if (normalizedMime.startsWith('text/') || normalizedMime === 'application/json') {
    return [createOpenAITextPart(new TextDecoder().decode(data))];
  }

  if (policy.supportsFileInput) {
    throw new Error(
      `File attachments are not yet supported by OpenAI-compatible request conversion. MIME type: ${normalizedMime}.`
    );
  }

  throw new Error(`Unsupported attachment MIME type "${normalizedMime}".`);
}

export function buildOpenAIContent(
  text: string,
  parts: OpenAIContentPart[]
): OpenAIContent {
  if (parts.length === 0) {
    return text || null;
  }

  const content: OpenAIContentPart[] = [];
  if (text) {
    content.push(createOpenAITextPart(text));
  }
  content.push(...parts);
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

export function buildModelBillingMetadata(
  model: Partial<Pick<ModelConfig, 'multiplier' | 'multiplierNumeric'>>
): ModelBillingMetadata {
  const multiplier = normalizeMultiplierLabel(model.multiplier);
  const explicitNumeric = normalizeMultiplierNumeric(model.multiplierNumeric);
  const multiplierNumeric = explicitNumeric ?? parseMultiplierNumeric(multiplier);

  return multiplierNumeric === undefined
    ? { multiplier }
    : { multiplier, multiplierNumeric };
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

export function resolveToolChoice(options: ResolveToolChoiceOptions): 'auto' | 'required' | 'none' | undefined {
  if (!options.hasTools) {
    return undefined;
  }

  const strategy = options.toolChoiceMode ?? 'required';
  if (strategy === 'omit') {
    return undefined;
  }
  if (strategy === 'none') {
    return 'none';
  }

  const requestedMode = options.requestedToolMode ?? 'auto';
  if (requestedMode === 'none') {
    return 'none';
  }

  if (requestedMode === 'auto') {
    return 'auto';
  }

  return strategy;
}

export function estimateStringTokens(text: string): number {
  return Math.ceil(text.length / APPROX_CHARS_PER_TOKEN);
}

export function estimateChatMessageTokens(parts: readonly TokenEstimatePart[]): number {
  return parts.reduce((total, part) => total + estimatePartTokens(part), 0);
}

function estimatePartTokens(part: TokenEstimatePart): number {
  switch (part.type) {
    case 'text':
      return estimateStringTokens(part.text);
    case 'image':
      return IMAGE_TOKEN_ESTIMATE;
    case 'data':
      return estimateDataPartTokens(part.data, part.mimeType);
    case 'toolCall':
      return estimateStringTokens(`${part.name} ${safeStringify(part.input)}`);
    case 'toolResult':
      return estimateStringTokens(part.callId) + estimateChatMessageTokens(part.content);
  }
}

function estimateDataPartTokens(data: Uint8Array, mimeType: string | undefined): number {
  const normalizedMime = normalizeMimeType(mimeType);
  if (COPILOT_METADATA_MIME_TYPES.has(normalizedMime)) {
    return 0;
  }
  if (normalizedMime.startsWith('image/')) {
    return IMAGE_TOKEN_ESTIMATE;
  }
  if (normalizedMime.startsWith('text/') || normalizedMime === 'application/json') {
    return estimateStringTokens(new TextDecoder().decode(data));
  }
  return estimateStringTokens(`[${normalizedMime}; ${data.byteLength} bytes]`);
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
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

function normalizeMultiplierLabel(multiplier: unknown): string {
  return typeof multiplier === 'string' && multiplier.trim() ? multiplier.trim() : '0x';
}

function normalizeMultiplierNumeric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function parseMultiplierNumeric(multiplier: string): number | undefined {
  const match = multiplier.trim().match(/^(\d+(?:\.\d+)?)x$/i);
  if (!match) {
    return undefined;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeMimeType(mimeType: string | undefined): string {
  const normalized = mimeType?.split(';', 1)[0]?.trim().toLowerCase();
  return normalized || 'application/octet-stream';
}
