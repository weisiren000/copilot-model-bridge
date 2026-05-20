import * as vscode from 'vscode';
import { getProviders, updateProviders, removeModel } from '../provider/config/cmb.provider.settings';
import {
  duplicateModel,
  importModels,
  updateModel,
  validateProviderConfig,
} from '../provider/config/cmb.provider.configManagement';
import { ModelConfig, ProviderConfig } from '../types';
import {
  askDuplicateModelId,
  askNumber,
  askText,
  buildModelSummary,
  parseModelArray,
  pickProvider,
  pickModel,
} from './cmb.management.ui';

export async function cmdEditModel(): Promise<void> {
  const picked = await pickModel('Select a model to edit');
  if (!picked) {
    return;
  }

  const name = await askText('Edit Model - Display Name', picked.model.name);
  if (name === undefined) {
    return;
  }

  const maxOutputTokens = await askNumber('Edit Model - Max Output Tokens', picked.model.maxOutputTokens);
  if (maxOutputTokens === undefined) {
    return;
  }

  const maxInputTokens = await askNumber('Edit Model - Max Input Tokens', picked.model.maxInputTokens);
  if (maxInputTokens === undefined) {
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
    { ignoreFocusOut: true, placeHolder: `${issues.length} provider configuration issue(s) found` }
  );
}

export async function cmdImportModelsFromJson(): Promise<void> {
  const provider = await pickProvider('Select a provider to import models into');
  if (!provider) {
    return;
  }

  const json = await vscode.window.showInputBox({
    title: 'Import Models from JSON',
    ignoreFocusOut: true,
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
    ignoreFocusOut: true,
    placeHolder: `${providers.length} provider(s) configured`,
    matchOnDescription: true,
    matchOnDetail: true,
  });
}
