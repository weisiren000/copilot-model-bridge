import * as vscode from 'vscode';
import { updateProviders } from '../provider/config/cmb.provider.settings';
import { updateProvider } from '../provider/config/cmb.provider.configManagement';
import { pickProvider, askText, askBaseUrl } from './cmb.management.ui';

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
