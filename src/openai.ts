import { ReasoningLevel } from './types';

const REASONING_LEVELS: readonly ReasoningLevel[] = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];

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

export function buildReasoningConfigurationSchema(defaultLevel: ReasoningLevel): Record<string, unknown> {
  return {
    properties: {
      reasoningEffort: {
        type: 'string',
        title: 'Thinking Effort',
        enum: REASONING_LEVELS,
        enumItemLabels: ['None', 'Low', 'Medium', 'High', 'Xhigh', 'Max'],
        enumDescriptions: [
          'No reasoning applied',
          'Faster responses with less reasoning',
          'Balanced reasoning and speed',
          'Greater reasoning depth but slower',
          'Maximum reasoning depth but slower',
          'Maximum available reasoning depth',
        ],
        default: defaultLevel,
        group: 'navigation',
      },
    },
  };
}

export function resolveReasoningLevel(
  modelOptions: { readonly [name: string]: unknown } | undefined,
  modelConfiguration: { readonly [name: string]: unknown } | undefined,
  modelDefault: ReasoningLevel
): ReasoningLevel {
  const level = readReasoningLevel(modelConfiguration) ?? readReasoningLevel(modelOptions);
  return isReasoningLevel(level) ? level : modelDefault;
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
