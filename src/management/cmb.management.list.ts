import * as vscode from 'vscode';
import { getProviders } from '../provider/config/cmb.provider.settings';
import { buildModelSummary } from './cmb.management.ui';

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
