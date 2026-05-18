import * as vscode from 'vscode';
import { getProviders, updateProviders } from './config';
import {
  duplicateModel,
  importModels,
  updateModel,
  updateProvider,
  validateProviderConfig,
} from './configManagement';
import { removeModel } from './config';
import { ModelConfig, ProviderConfig } from './types';

type ProviderItem = vscode.QuickPickItem & { providerId: string };
type ModelItem = vscode.QuickPickItem & { providerId: string; modelId: string };

export async function cmdEditProvider(): Promise<void> {
  const provider = await pickProvider('Select a provider to edit');
  if (!provider) {
    return;
  }

  const displayName = await askText('Edit Provider - Display Name', provider.displayName);
  if (displayName === undefined) {
    return;
  }

  const baseUrl = await askBaseUrl(provider.baseUrl);
  if (baseUrl === undefined) {
    return;
  }

  const apiKey = await askText('Edit Provider - API Key', provider.apiKey, true);
  if (apiKey === undefined) {
    return;
  }

  await updateProviders(providers => updateProvider(providers, provider.id, {
    displayName,
    baseUrl,
    apiKey,
  }));
  vscode.window.showInformationMessage(`Provider "${displayName}" updated.`);
}

export async function cmdEditModel(): Promise<void> {
  const picked = await pickModel('Select a model to edit');
  if (!picked) {
    return;
  }

  const name = await askText('Edit Model - Display Name', picked.model.name);
  if (name === undefined) {
    return;
  }

  const maxInputTokens = await askNumber('Edit Model - Max Input Tokens', picked.model.maxInputTokens);
  if (maxInputTokens === undefined) {
    return;
  }

  const maxOutputTokens = await askNumber('Edit Model - Max Output Tokens', picked.model.maxOutputTokens);
  if (maxOutputTokens === undefined) {
    return;
  }

  await updateProviders(providers => updateModel(providers, picked.provider.id, picked.model.id, {
    name,
    maxInputTokens,
    maxOutputTokens,
  }));
  vscode.window.showInformationMessage(`Model "${name}" updated.`);
}

export async function cmdDuplicateModel(): Promise<void> {
  const picked = await pickModel('Select a model to duplicate');
  if (!picked) {
    return;
  }

  const duplicateId = await askDuplicateModelId(picked.provider, picked.model);
  if (!duplicateId) {
    return;
  }

  const duplicateName = await askText('Duplicate Model - Display Name', `${picked.model.name} Copy`);
  if (!duplicateName) {
    return;
  }

  await updateProviders(providers => duplicateModel(
    providers,
    picked.provider.id,
    picked.model.id,
    duplicateId,
    duplicateName
  ));
  vscode.window.showInformationMessage(`Model "${duplicateName}" duplicated.`);
}

export async function cmdRemoveModel(): Promise<void> {
  const picked = await pickModel('Select a model to remove');
  if (!picked) {
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `Remove model "${picked.model.name}" from "${picked.provider.displayName}"?`,
    { modal: true },
    'Remove'
  );
  if (confirm !== 'Remove') {
    return;
  }

  const removed = await removeModel(picked.provider.id, picked.model.id);
  if (removed) {
    vscode.window.showInformationMessage(`Model "${picked.model.name}" removed.`);
  }
}

export async function cmdValidateProviderConfig(): Promise<void> {
  const issues = validateProviderConfig(getProviders());
  if (issues.length === 0) {
    vscode.window.showInformationMessage('Provider configuration validation passed.');
    return;
  }

  await vscode.window.showQuickPick(
    issues.map(issue => ({
      label: issue.severity === 'error' ? '$(error) Error' : '$(warning) Warning',
      description: [issue.providerId, issue.modelId].filter(Boolean).join(' / '),
      detail: issue.message,
    })),
    { placeHolder: `${issues.length} provider configuration issue(s) found` }
  );
}

export async function cmdImportModelsFromJson(): Promise<void> {
  const provider = await pickProvider('Select a provider to import models into');
  if (!provider) {
    return;
  }

  const json = await vscode.window.showInputBox({
    title: 'Import Models from JSON',
    prompt: 'Paste a JSON array of model objects',
    placeHolder: '[{"id":"model-id","name":"Model Name"}]',
  });
  if (!json) {
    return;
  }

  const models = parseModelArray(json);
  if (!models) {
    vscode.window.showErrorMessage('Import failed: JSON must be an array of model objects with id and name.');
    return;
  }

  await updateProviders(providers => importModels(providers, provider.id, models));
  vscode.window.showInformationMessage(`Imported ${models.length} model(s) into "${provider.displayName}".`);
}

export async function cmdListProviders(): Promise<void> {
  const providers = getProviders();

  if (providers.length === 0) {
    vscode.window.showInformationMessage('No providers configured yet. Use "Add Provider" to get started.');
    return;
  }

  const items: vscode.QuickPickItem[] = [];
  for (const provider of providers) {
    items.push({
      label: `$(server) ${provider.displayName}`,
      description: provider.baseUrl,
      kind: vscode.QuickPickItemKind.Separator,
    });

    if (provider.models.length === 0) {
      items.push({ label: '  $(warning) No models configured', description: 'Add a model to use this provider' });
      continue;
    }

    for (const model of provider.models) {
      items.push({
        label: `  $(circuit-board) ${model.name}`,
        description: model.id,
        detail: buildModelSummary(model),
      });
    }
  }

  await vscode.window.showQuickPick(items, {
    placeHolder: `${providers.length} provider(s) configured`,
    matchOnDescription: true,
    matchOnDetail: true,
  });
}

async function pickProvider(placeHolder: string): Promise<ProviderConfig | undefined> {
  const providers = getProviders();
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
    { placeHolder }
  );
  return item ? providers.find(provider => provider.id === item.providerId) : undefined;
}

async function pickModel(
  placeHolder: string
): Promise<{ provider: ProviderConfig; model: ModelConfig } | undefined> {
  const providers = getProviders();
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

  const item = await vscode.window.showQuickPick(items, { placeHolder });
  const provider = item ? providers.find(candidate => candidate.id === item.providerId) : undefined;
  const model = provider?.models.find(candidate => candidate.id === item?.modelId);
  return provider && model ? { provider, model } : undefined;
}

async function askText(title: string, value: string, password = false): Promise<string | undefined> {
  return vscode.window.showInputBox({
    title,
    value,
    password,
    validateInput: input => input.trim() ? undefined : 'Value cannot be empty',
  });
}

async function askBaseUrl(value: string): Promise<string | undefined> {
  return vscode.window.showInputBox({
    title: 'Edit Provider - Base URL',
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

async function askNumber(title: string, value: number): Promise<number | undefined> {
  const input = await vscode.window.showInputBox({
    title,
    value: String(value),
    validateInput: candidate => {
      const parsed = Number(candidate);
      return Number.isInteger(parsed) && parsed > 0 ? undefined : 'Enter a positive integer';
    },
  });
  return input === undefined ? undefined : Number(input);
}

async function askDuplicateModelId(
  provider: ProviderConfig,
  model: ModelConfig
): Promise<string | undefined> {
  return vscode.window.showInputBox({
    title: 'Duplicate Model - Model ID',
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

function parseModelArray(json: string): ModelConfig[] | undefined {
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

function isImportableModel(value: unknown): value is ModelConfig {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { id?: unknown }).id === 'string'
    && typeof (value as { name?: unknown }).name === 'string';
}

function buildModelSummary(model: ModelConfig): string {
  return `  Input: ${model.maxInputTokens.toLocaleString()} tokens · Tools: ${model.supportsToolCalling ? 'yes' : 'no'} · Edit: ${model.supportsEditTools ? 'yes' : 'no'} · Vision: ${model.supportsVision ? 'yes' : 'no'} · Video: ${model.supportsVideo ? 'yes' : 'no'} · Files: ${model.supportsFileInput ? 'yes' : 'no'} · Reasoning: ${model.supportsReasoning ? (model.defaultReasoningLevel ?? 'medium') : 'no'} · Cost: ${model.multiplier ?? '0x'}`;
}
