import * as vscode from 'vscode';
import { getProviders, removeProvider } from '../provider/config/cmb.provider.settings';

export async function cmdRemoveProvider(): Promise<void> {
  const providers = getProviders();
  if (providers.length === 0) {
    vscode.window.showInformationMessage('No providers configured. Add one first!');
    return;
  }

  const items = providers.map(p => ({
    label: p.displayName,
    description: `${p.models.length} model(s) · ${p.baseUrl}`,
    providerId: p.id,
  }));

  const chosen = await vscode.window.showQuickPick(items, {
    ignoreFocusOut: true,
    placeHolder: 'Select a provider to remove',
  });
  if (!chosen) { return; }

  const confirm = await vscode.window.showWarningMessage(
    `Remove provider "${chosen.label}" and all its ${
      providers.find(p => p.id === chosen.providerId)?.models.length ?? 0
    } model(s)?`,
    { modal: true },
    'Remove'
  );
  if (confirm !== 'Remove') { return; }

  const removed = await removeProvider(chosen.providerId);
  if (removed) {
    vscode.window.showInformationMessage(`Provider "${chosen.label}" removed.`);
  }
}
