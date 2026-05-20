import { ModelConfig } from '../../types';

export interface ModelBillingMetadata {
  multiplier: string;
  multiplierNumeric?: number;
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
