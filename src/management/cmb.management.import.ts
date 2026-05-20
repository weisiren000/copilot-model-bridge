import * as vscode from 'vscode';
import { updateProviders } from '../provider/config/cmb.provider.settings';
import { importModels } from '../provider/config/cmb.provider.configManagement';
import { parseModelArray, pickProvider } from './cmb.management.ui';

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
