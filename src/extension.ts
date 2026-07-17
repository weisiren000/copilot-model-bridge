/**
 * extension.ts
 *
 * Extension entry-point. Called by VS Code when the extension activates.
 *
 * Activation trigger: "onStartupFinished" (declared in package.json) so the
 * provider is always available as soon as VS Code is ready, without requiring
 * the user to open a specific file type first.
 *
 * Responsibilities:
 *   1. Register the LanguageModelChatProvider with VS Code's LM API.
 *   2. Register all management commands.
 *   3. Listen for settings changes and notify VS Code when the model list changes.
 */

import * as vscode from 'vscode';
import { OpenAICompatChatProvider } from './provider/core/cmb.provider.chatProvider';
import { registerCommands } from './commands/index';
import { CONFIG_SECTION, LEGACY_CONFIG_SECTION } from './provider/config/cmb.provider.configKeys';
import {
  buildProposedApiLaunchCommand,
  tryRegisterLanguageModelProvider,
} from './compat/cmb.runtimeCompatibility';

/** The vendor ID must exactly match the "vendor" field in package.json contributes */
const VENDOR_ID = 'copilot-model-bridge';
const NATIVE_MODEL_MANAGER_COMMAND = 'workbench.action.chat.manage';
const OPEN_NATIVE_MODELS = '打开原生 Custom Endpoint';
const COPY_LAUNCH_COMMAND = '复制临时启动命令';

export function activate(context: vscode.ExtensionContext): void {
  console.log('[copilot-model-bridge] Extension activating...');

  // ── 1. Instantiate and register the LM provider ─────────────────────────
  //
  // registerLanguageModelChatProvider returns a Disposable.
  // We store it in context.subscriptions so VS Code cleans it up on deactivation.
  const chatProvider = new OpenAICompatChatProvider();
  context.subscriptions.push(chatProvider);

  const providerDisposable = tryRegisterLanguageModelProvider(
    () => vscode.lm.registerLanguageModelChatProvider(VENDOR_ID, chatProvider)
  );
  if (providerDisposable) {
    context.subscriptions.push(providerDisposable);
    chatProvider.refreshModels();
  } else {
    void showProposedApiUnavailableMessage(context);
  }

  // ── 2. Register all management commands ──────────────────────────────────
  registerCommands(context, () => chatProvider.refreshModels());

  // ── 3. Watch for settings changes ────────────────────────────────────────
  //
  // When the user edits the provider settings
  // (either via our commands or manually in settings.json), we need to tell
  // VS Code to re-fetch the model list so the Copilot model picker is updated.
  //
  // The recommended pattern from the VS Code API is to call
  // vscode.lm.registerLanguageModelChatProvider again with the same vendor ID
  // (which forces a model-list refresh) OR to rely on the fact that VS Code
  // will call provideLanguageModelChatInformation again on next access.
  //
  // Here we simply notify the user when the setting changes so they know
  // they may need to re-open the Copilot Chat panel to see new models.
  const settingsWatcher = vscode.workspace.onDidChangeConfiguration(event => {
    if (
      event.affectsConfiguration(`${CONFIG_SECTION}.providers`)
      || event.affectsConfiguration(`${LEGACY_CONFIG_SECTION}.providers`)
    ) {
      console.log('[copilot-model-bridge] Provider settings changed, refreshing model list.');
      chatProvider.refreshModels();
      
      // Show a subtle status-bar notification (not a popup) to indicate refresh
      const statusMsg = vscode.window.setStatusBarMessage(
        '$(sync~spin) Copilot Model Bridge: model list updated',
        3000   // auto-dismiss after 3 seconds
      );
      context.subscriptions.push(statusMsg);
    }
  });
  context.subscriptions.push(settingsWatcher);

  console.log('[copilot-model-bridge] Extension activated successfully.');
}

export function deactivate(): void {
  console.log('[copilot-model-bridge] Extension deactivated.');
}

async function showProposedApiUnavailableMessage(
  context: vscode.ExtensionContext
): Promise<void> {
  const warningKey = `proposedApiUnavailable:${vscode.version}`;
  if (context.globalState.get<boolean>(warningKey)) {
    return;
  }
  await context.globalState.update(warningKey, true);

  const choice = await vscode.window.showErrorMessage(
    'Copilot Model Bridge 无法注册模型：当前 VS Code 未授权此 Marketplace 扩展使用 '
      + 'chatProvider 实验 API。可改用 VS Code 原生 Custom Endpoint；临时使用需要带 '
      + '--enable-proposed-api 启动。',
    OPEN_NATIVE_MODELS,
    COPY_LAUNCH_COMMAND
  );

  if (choice === OPEN_NATIVE_MODELS) {
    await vscode.commands.executeCommand(NATIVE_MODEL_MANAGER_COMMAND);
  } else if (choice === COPY_LAUNCH_COMMAND) {
    await vscode.env.clipboard.writeText(buildProposedApiLaunchCommand());
    vscode.window.setStatusBarMessage('Copilot Model Bridge：启动命令已复制', 3000);
  }
}
