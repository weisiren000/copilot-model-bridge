import { ModelConfig, ReasoningLevel } from '../../types';

const REASONING_LEVELS: readonly ReasoningLevel[] = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
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

function normalizeSupportedReasoningLevels(levels: readonly unknown[] | undefined): ReasoningLevel[] {
  const normalized = (levels ?? REASONING_LEVELS)
    .filter(isReasoningLevel)
    .filter((level, index, values) => values.indexOf(level) === index);

  return normalized.length > 0 ? normalized : [DEFAULT_REASONING_LEVEL];
}
