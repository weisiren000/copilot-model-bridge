import * as vscode from 'vscode';
import { getProviders } from '../provider/config/cmb.provider.settings';
import { validateProviderConfig } from '../provider/config/cmb.provider.configManagement';

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
