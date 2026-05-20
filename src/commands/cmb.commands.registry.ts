import * as vscode from 'vscode';
import { openConfigManagerPanel } from '../configManager/cmb.configManager.panel';
import { cmdManage } from './cmb.commands.manage';
import { cmdAddProvider } from './cmb.commands.providerWizard';
import { cmdAddModel } from './cmb.commands.modelWizard';
import { cmdRemoveProvider } from './cmb.commands.removeProvider';
import {
  cmdDuplicateModel,
  cmdEditModel,
  cmdEditProvider,
  cmdImportModelsFromJson,
  cmdListProviders,
  cmdRemoveModel,
  cmdValidateProviderConfig,
} from '../management';

export function registerCommands(context: vscode.ExtensionContext, onConfigSaved?: () => void): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-model-bridge.manage', () => openConfigManagerPanel(context, onConfigSaved)),
    vscode.commands.registerCommand('copilot-model-bridge.openConfigManager', () => openConfigManagerPanel(context, onConfigSaved)),
    vscode.commands.registerCommand('copilot-model-bridge.quickManage', cmdManage),
    vscode.commands.registerCommand('copilot-model-bridge.addProvider', cmdAddProvider),
    vscode.commands.registerCommand('copilot-model-bridge.removeProvider', cmdRemoveProvider),
    vscode.commands.registerCommand('copilot-model-bridge.addModel', () => cmdAddModel()),
    vscode.commands.registerCommand('copilot-model-bridge.removeModel', cmdRemoveModel),
    vscode.commands.registerCommand('copilot-model-bridge.listProviders', cmdListProviders),
    vscode.commands.registerCommand('copilot-model-bridge.editProvider', cmdEditProvider),
    vscode.commands.registerCommand('copilot-model-bridge.editModel', cmdEditModel),
    vscode.commands.registerCommand('copilot-model-bridge.duplicateModel', cmdDuplicateModel),
    vscode.commands.registerCommand('copilot-model-bridge.validateConfig', cmdValidateProviderConfig),
    vscode.commands.registerCommand('copilot-model-bridge.importModelsFromJson', cmdImportModelsFromJson),
  );
}
