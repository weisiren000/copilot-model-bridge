import * as vscode from 'vscode';
import { getProviders } from '../provider/config/cmb.provider.settings';
import { cmdAddModel } from './cmb.commands.modelWizard';
import { cmdAddProvider } from './cmb.commands.providerWizard';
import { cmdRemoveProvider } from './cmb.commands.removeProvider';
import { cmdDuplicateModel, cmdEditModel, cmdEditProvider, cmdImportModelsFromJson, cmdListProviders, cmdRemoveModel, cmdValidateProviderConfig } from '../management';

/** Management hub – shows a quick-pick menu with available actions */
export async function cmdManage(): Promise<void> {
  const providers = getProviders();
  const totalModels = providers.reduce((acc, p) => acc + p.models.length, 0);

  const choice = await vscode.window.showQuickPick(
    [
      {
        label: '$(add) Add Provider',
        description: 'Register a new OpenAI-compatible API endpoint',
        action: 'add',
      },
      {
        label: '$(trash) Remove Provider',
        description: `Currently ${providers.length} provider(s) configured`,
        action: 'remove',
      },
      {
        label: '$(edit) Edit Provider',
        description: 'Update provider display name, base URL, or API key',
        action: 'editProvider',
      },
      {
        label: '$(circuit-board) Add Model to Provider',
        description: 'Add a model ID to an existing provider',
        action: 'addModel',
      },
      {
        label: '$(edit) Edit Model',
        description: 'Update model display name and token limits',
        action: 'editModel',
      },
      {
        label: '$(copy) Duplicate Model',
        description: 'Create a new model from an existing model configuration',
        action: 'duplicateModel',
      },
      {
        label: '$(json) Import Models from JSON',
        description: 'Append models to an existing provider without hand-editing settings',
        action: 'importModels',
      },
      {
        label: '$(checklist) Validate Provider Config',
        description: 'Find duplicate model IDs and inconsistent settings',
        action: 'validate',
      },
      {
        label: '$(close) Remove Model from Provider',
        description: `Currently ${totalModels} model(s) configured`,
        action: 'removeModel',
      },
      {
        label: '$(list-unordered) List All Providers & Models',
        description: 'Show a summary of the current configuration',
        action: 'list',
      },
      {
        label: '$(layout) Open Config Manager',
        description: 'Open the persistent provider and model configuration page',
        action: 'openConfigManager',
      },
    ],
    { ignoreFocusOut: true, placeHolder: 'OpenAI-Compatible Provider Management' }
  );

  if (!choice) { return; }

  switch (choice.action) {
    case 'add':        await cmdAddProvider();   break;
    case 'remove':     await cmdRemoveProvider(); break;
    case 'editProvider': await cmdEditProvider(); break;
    case 'addModel':   await cmdAddModel();       break;
    case 'editModel':  await cmdEditModel();      break;
    case 'duplicateModel': await cmdDuplicateModel(); break;
    case 'importModels': await cmdImportModelsFromJson(); break;
    case 'validate':   await cmdValidateProviderConfig(); break;
    case 'removeModel':await cmdRemoveModel();    break;
    case 'list':       await cmdListProviders();  break;
    case 'openConfigManager':
      vscode.commands.executeCommand('copilot-model-bridge.openConfigManager');
      break;
  }
}
