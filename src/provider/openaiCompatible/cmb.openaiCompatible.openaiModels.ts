import { ModelConfig, ReasoningLevel } from '../../types';

export type ChatMaxTokenField = 'max_tokens' | 'max_completion_tokens';

export type OpenAIModelProfile = Partial<ModelConfig> & Pick<ModelConfig, 'id' | 'name'>;

export interface OpenAIChatRequestPolicyOptions {
  providerBaseUrl: string;
  modelId: string;
}

export interface OpenAIChatRequestPolicy {
  maxTokenField: ChatMaxTokenField;
}

const GPT_56_REASONING_LEVELS: ReasoningLevel[] = [
  'none',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

const GPT_56_MODEL_NAMES: Record<string, string> = {
  'gpt-5.6': 'GPT-5.6 (Sol alias)',
  'gpt-5.6-sol': 'GPT-5.6 Sol',
  'gpt-5.6-terra': 'GPT-5.6 Terra',
  'gpt-5.6-luna': 'GPT-5.6 Luna',
};

const GPT_56_MODEL_IDS = new Set(Object.keys(GPT_56_MODEL_NAMES));

export function getOpenAIModelProfile(
  providerBaseUrl: string,
  modelId: string
): OpenAIModelProfile | undefined {
  if (!isOfficialOpenAIBaseUrl(providerBaseUrl)) {
    return undefined;
  }
  const normalizedId = modelId.trim().toLowerCase();
  const name = GPT_56_MODEL_NAMES[normalizedId];
  if (!name) {
    return undefined;
  }

  return {
    id: normalizedId,
    name,
    family: 'gpt-5.6',
    maxInputTokens: 922000,
    maxOutputTokens: 128000,
    supportsToolCalling: true,
    supportsVision: true,
    supportsEditTools: true,
    supportsReasoning: true,
    supportedReasoningLevels: [...GPT_56_REASONING_LEVELS],
    defaultReasoningLevel: 'medium',
  };
}

export function resolveOpenAIChatRequestPolicy(
  options: OpenAIChatRequestPolicyOptions
): OpenAIChatRequestPolicy {
  if (!isOfficialOpenAIGpt56Request(options.providerBaseUrl, options.modelId)) {
    return { maxTokenField: 'max_tokens' };
  }

  return {
    maxTokenField: 'max_completion_tokens',
  };
}

function isOfficialOpenAIGpt56Request(baseUrl: string, modelId: string): boolean {
  return isOfficialOpenAIBaseUrl(baseUrl) && GPT_56_MODEL_IDS.has(modelId.trim().toLowerCase());
}

function isOfficialOpenAIBaseUrl(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === 'api.openai.com';
  } catch {
    return false;
  }
}
