/**
 * xAI Grok adapter for endpoint routing and model-specific reasoning levels.
 * The payload and stream formats otherwise use the existing Responses or
 * Chat Completions implementations.
 *
 * References:
 * - https://docs.x.ai/developers/model-capabilities/reasoning
 * - https://docs.x.ai/developers/model-capabilities/text/generate-text
 */

import { ProviderApiStyle, ProviderConfig, ReasoningLevel } from '../../types';

type GrokReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh';

export interface GrokModelProfile {
  id: string;
  name: string;
  family: string;
  contextWindowTokens: number;
  supportsToolCalling: true;
  supportsVision: true;
  supportsEditTools: true;
  supportsReasoning: boolean;
  supportedReasoningLevels?: ReasoningLevel[];
  defaultReasoningLevel?: ReasoningLevel;
}

export function isOfficialXAIBaseUrl(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === 'api.x.ai';
  } catch {
    return false;
  }
}

export function isGrokModelId(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase();
  return normalized.startsWith('grok-') || normalized.includes('/grok-');
}

export function getGrokModelProfile(
  providerBaseUrl: string,
  modelId: string
): GrokModelProfile | undefined {
  if (!isOfficialXAIBaseUrl(providerBaseUrl)) {
    return undefined;
  }

  const normalizedId = modelId.trim().toLowerCase();
  const common = {
    id: normalizedId,
    supportsToolCalling: true as const,
    supportsVision: true as const,
    supportsEditTools: true as const,
  };
  if (isGrok45Model(normalizedId)) {
    return buildReasoningProfile(common, 'Grok 4.5', 'grok-4.5', 500000, ['low', 'medium', 'high'], 'high');
  }
  if (isGrok43Model(normalizedId)) {
    return buildReasoningProfile(common, 'Grok 4.3', 'grok-4.3', 1000000, ['none', 'low', 'medium', 'high'], 'low');
  }
  if (isGrok420Model(normalizedId)) {
    const multiAgent = normalizedId.includes('multi-agent');
    if (!multiAgent) {
      return {
        ...common,
        name: normalizedId.includes('non-reasoning')
          ? 'Grok 4.20 Non-Reasoning'
          : 'Grok 4.20',
        family: 'grok-4.20',
        contextWindowTokens: 1000000,
        supportsReasoning: false,
      };
    }
    return buildReasoningProfile(
      common,
      'Grok 4.20 Multi-Agent',
      'grok-4.20',
      1000000,
      ['low', 'medium', 'high', 'xhigh'],
      'high'
    );
  }
  if (isGrokBuildModel(normalizedId)) {
    return {
      ...common,
      name: 'Grok Build 0.1',
      family: 'grok-build',
      contextWindowTokens: 256000,
      supportsReasoning: false,
    };
  }
  return undefined;
}

export function isGrokRequest(
  provider: Pick<ProviderConfig, 'id' | 'baseUrl'>,
  modelId: string
): boolean {
  const providerId = provider.id.trim().toLowerCase();
  return isOfficialXAIBaseUrl(provider.baseUrl)
    || hasProviderIdSegment(providerId, 'xai')
    || hasProviderIdSegment(providerId, 'x-ai')
    || hasProviderIdSegment(providerId, 'grok')
    || isGrokModelId(modelId);
}

export function resolveGrokApiStyle(
  provider: Pick<ProviderConfig, 'id' | 'baseUrl' | 'apiStyle'>
): ProviderApiStyle {
  if (isOfficialXAIBaseUrl(provider.baseUrl)) {
    return 'responses';
  }
  if (provider.apiStyle === 'responses' || provider.apiStyle === 'anthropic') {
    return provider.apiStyle;
  }
  return 'chat';
}

export function resolveGrokEndpointUrl(baseUrl: string, endpointPath: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${endpointPath.replace(/^\/+/, '')}`;
}

export function sanitizeGrokChatMessages(messages: Array<Record<string, unknown>>): void {
  for (const message of messages) {
    delete message.__reasoningContent;
    delete message.reasoning_content;
  }
}

export function normalizeGrokReasoningEffort(
  modelId: string,
  level: ReasoningLevel | undefined
): GrokReasoningEffort | undefined {
  if (!level) {
    return undefined;
  }

  const normalizedModelId = modelId.toLowerCase();
  if (level === 'none') {
    return isGrok43Model(normalizedModelId) ? 'none' : 'low';
  }
  if (level === 'low') {
    return 'low';
  }
  if (level === 'medium') {
    return 'medium';
  }
  if (level === 'xhigh' || level === 'max') {
    return normalizedModelId.includes('multi-agent') ? 'xhigh' : 'high';
  }
  return 'high';
}

function hasProviderIdSegment(providerId: string, segment: string): boolean {
  return providerId === segment
    || providerId.startsWith(`${segment}-`)
    || providerId.endsWith(`-${segment}`)
    || providerId.includes(`-${segment}-`);
}

function isGrok43Model(modelId: string): boolean {
  return modelId === 'grok-latest' || /(?:^|\/)grok-4\.3(?:$|-)/.test(modelId);
}

function isGrok45Model(modelId: string): boolean {
  return /(?:^|\/)grok-4\.5(?:$|-)/.test(modelId) || modelId === 'grok-build-latest';
}

function isGrok420Model(modelId: string): boolean {
  return /(?:^|\/)grok-4\.20(?:$|-)/.test(modelId);
}

function isGrokBuildModel(modelId: string): boolean {
  return modelId === 'grok-build-0.1'
    || modelId === 'grok-code-fast'
    || modelId.startsWith('grok-code-fast-1');
}

function buildReasoningProfile(
  common: Pick<GrokModelProfile, 'id' | 'supportsToolCalling' | 'supportsVision' | 'supportsEditTools'>,
  name: string,
  family: string,
  contextWindowTokens: number,
  supportedReasoningLevels: ReasoningLevel[],
  defaultReasoningLevel: ReasoningLevel
): GrokModelProfile {
  return {
    ...common,
    name,
    family,
    contextWindowTokens,
    supportsReasoning: true,
    supportedReasoningLevels,
    defaultReasoningLevel,
  };
}