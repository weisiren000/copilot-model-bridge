import { ModelConfig, ProviderConfig } from '../../types';

export interface ModelMetadata {
  id: string;
  name: string;
  family: string;
  version: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  detail: string;
  tooltip: string;
  category?: string;
}

export interface BuildModelMetadataOptions {
  compoundId: string;
  provider: Pick<ProviderConfig, 'id' | 'displayName' | 'baseUrl'>;
  model: ModelConfig;
}

export function buildModelMetadata(options: BuildModelMetadataOptions): ModelMetadata {
  const family = normalizeNonEmpty(options.model.family) ?? inferModelFamily(options.model.id);
  const metadata: ModelMetadata = {
    id: options.compoundId,
    name: `${options.model.name} (${options.provider.displayName})`,
    family,
    version: normalizeNonEmpty(options.model.version) ?? '',
    maxInputTokens: options.model.maxInputTokens,
    maxOutputTokens: options.model.maxOutputTokens,
    detail: buildDetail(options.provider, options.model),
    tooltip: buildTooltip(options.provider, options.model, family),
  };

  const category = buildCategory(options.model);
  if (category) {
    metadata.category = category;
  }

  return metadata;
}

export function inferModelFamily(modelId: string): string {
  const normalized = modelId.trim().toLowerCase();
  const lastSegment = normalized.split('/').pop() ?? normalized;
  const firstToken = lastSegment.split(/[-_.:]/).find(Boolean);
  return firstToken || 'custom';
}

export function normalizeStatusIcon(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return /^[a-z][a-z0-9-]*$/i.test(trimmed) ? trimmed : undefined;
}

function buildDetail(
  provider: Pick<ProviderConfig, 'id' | 'displayName'>,
  model: Pick<ModelConfig, 'id'>
): string {
  return `${provider.displayName} · ${model.id}`;
}

function buildTooltip(
  provider: Pick<ProviderConfig, 'id' | 'displayName' | 'baseUrl'>,
  model: Pick<ModelConfig, 'id' | 'name' | 'version'>,
  family: string
): string {
  const lines = [
    `Provider: ${provider.displayName} (${provider.id})`,
    `Model: ${model.name} (${model.id})`,
    `Family: ${family}`,
  ];

  const version = normalizeNonEmpty(model.version);
  if (version) {
    lines.push(`Version: ${version}`);
  }
  lines.push(`Base URL: ${provider.baseUrl}`);
  return lines.join('\n');
}

function buildCategory(model: Pick<ModelConfig, 'categoryLabel' | 'categoryOrder'>): string | undefined {
  const label = normalizeNonEmpty(model.categoryLabel);
  return label;
}

function normalizeNonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
