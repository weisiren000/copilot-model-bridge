import { ModelConfig } from '../types';

export function buildModelSummary(model: ModelConfig): string {
  return `  Input: ${formatTokenCount(model.maxInputTokens)} tokens · Output: ${formatTokenCount(model.maxOutputTokens)} tokens · Tools: ${model.supportsToolCalling ? 'yes' : 'no'} · Edit: ${model.supportsEditTools ? 'yes' : 'no'} · Vision: ${model.supportsVision ? 'yes' : 'no'} · Video: ${model.supportsVideo ? 'yes' : 'no'} · Files: ${model.supportsFileInput ? 'yes' : 'no'} · Reasoning: ${model.supportsReasoning ? (model.defaultReasoningLevel ?? 'medium') : 'no'} · Cost: ${model.multiplier ?? '0x'}`;
}

function formatTokenCount(value: number): string {
  return value.toLocaleString();
}
