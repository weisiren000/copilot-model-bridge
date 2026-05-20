import * as vscode from 'vscode';
import { ModelConfig, ProviderConfig } from '../types';

export type ProviderItem = vscode.QuickPickItem & { providerId: string };
export type ModelItem = vscode.QuickPickItem & { providerId: string; modelId: string };

export async function pickProvider(placeHolder: string): Promise<ProviderConfig | undefined> {
  const providers = (await import('../provider/config/cmb.provider.settings')).getProviders();
  if (providers.length === 0) {
    vscode.window.showInformationMessage('No providers configured.');
    return undefined;
  }

  const item = await vscode.window.showQuickPick<ProviderItem>(
    providers.map(provider => ({
      label: provider.displayName,
      description: provider.baseUrl,
      providerId: provider.id,
    })),
    { ignoreFocusOut: true, placeHolder }
  );
  return item ? providers.find(provider => provider.id === item.providerId) : undefined;
}

export async function pickModel(
  placeHolder: string
): Promise<{ provider: ProviderConfig; model: ModelConfig } | undefined> {
  const providers = (await import('../provider/config/cmb.provider.settings')).getProviders();
  const items: ModelItem[] = providers.flatMap(provider => provider.models.map(model => ({
    label: model.name,
    description: model.id,
    detail: provider.displayName,
    providerId: provider.id,
    modelId: model.id,
  })));

  if (items.length === 0) {
    vscode.window.showInformationMessage('No models configured.');
    return undefined;
  }

  const item = await vscode.window.showQuickPick(items, { ignoreFocusOut: true, placeHolder });
  const provider = item ? providers.find(candidate => candidate.id === item.providerId) : undefined;
  const model = provider?.models.find(candidate => candidate.id === item?.modelId);
  return provider && model ? { provider, model } : undefined;
}

export async function askText(title: string, value: string, password = false): Promise<string | undefined> {
  return vscode.window.showInputBox({
    title,
    ignoreFocusOut: true,
    value,
    password,
    validateInput: input => input.trim() ? undefined : 'Value cannot be empty',
  });
}

export async function askBaseUrl(value: string): Promise<string | undefined> {
  return vscode.window.showInputBox({
    title: 'Edit Provider - Base URL',
    ignoreFocusOut: true,
    value,
    validateInput: input => {
      try {
        new URL(input);
        return undefined;
      } catch {
        return 'Enter a valid URL';
      }
    },
  });
}

export async function askNumber(title: string, value: number): Promise<number | undefined> {
  const input = await vscode.window.showInputBox({
    title,
    ignoreFocusOut: true,
    value: String(value),
    validateInput: candidate => {
      const parsed = Number(candidate);
      return Number.isInteger(parsed) && parsed > 0 ? undefined : 'Enter a positive integer';
    },
  });
  return input === undefined ? undefined : Number(input);
}

export async function askDuplicateModelId(
  provider: ProviderConfig,
  model: ModelConfig
): Promise<string | undefined> {
  return vscode.window.showInputBox({
    title: 'Duplicate Model - Model ID',
    ignoreFocusOut: true,
    value: `${model.id}-copy`,
    validateInput: input => {
      if (!input.trim()) {
        return 'Model ID cannot be empty';
      }
      return provider.models.some(candidate => candidate.id === input)
        ? `Model "${input}" already exists in provider "${provider.displayName}"`
        : undefined;
    },
  });
}

export function parseModelArray(json: string): ModelConfig[] | undefined {
  try {
    const value = JSON.parse(json);
    if (!Array.isArray(value)) {
      return undefined;
    }
    return value.every(isImportableModel) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function buildModelSummary(model: ModelConfig): string {
  return `  Input: ${model.maxInputTokens.toLocaleString()} tokens · Tools: ${model.supportsToolCalling ? 'yes' : 'no'} · Edit: ${model.supportsEditTools ? 'yes' : 'no'} · Vision: ${model.supportsVision ? 'yes' : 'no'} · Video: ${model.supportsVideo ? 'yes' : 'no'} · Files: ${model.supportsFileInput ? 'yes' : 'no'} · Reasoning: ${model.supportsReasoning ? (model.defaultReasoningLevel ?? 'medium') : 'no'} · Cost: ${model.multiplier ?? '0x'}`;
}

function isImportableModel(value: unknown): value is ModelConfig {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { id?: unknown }).id === 'string'
    && typeof (value as { name?: unknown }).name === 'string';
}
