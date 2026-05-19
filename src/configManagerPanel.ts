import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { getProviders, saveProviders } from './config';
import { validateProviderConfig } from './configManagement';
import { renderConfigManagerHtml } from './configManagerHtml';
import {
  ConfigManagerState,
  createInitialConfigManagerState,
  reduceConfigManagerMessage,
} from './configManagerMessages';

const VIEW_TYPE = 'copilotModelBridge.configManager';

let currentPanel: vscode.WebviewPanel | undefined;

export function openConfigManagerPanel(
  context: vscode.ExtensionContext,
  onSaved?: () => void
): void {
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.One);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    VIEW_TYPE,
    'Copilot Model Bridge Config',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [],
    }
  );
  currentPanel = panel;
  panel.webview.html = renderConfigManagerHtml({
    cspSource: panel.webview.cspSource,
    nonce: createNonce(),
  });

  panel.onDidDispose(() => {
    currentPanel = undefined;
  }, undefined, context.subscriptions);

  panel.webview.onDidReceiveMessage(async message => {
    await handleWebviewMessage(panel, message, onSaved);
  }, undefined, context.subscriptions);
}

async function handleWebviewMessage(
  panel: vscode.WebviewPanel,
  message: unknown,
  onSaved?: () => void
): Promise<void> {
  if (!isWebviewMessage(message)) {
    return;
  }

  if (message.type === 'ready') {
    postState(panel, createInitialConfigManagerState(getProviders()));
    return;
  }
  if (message.type === 'mutate') {
    postState(panel, reduceConfigManagerMessage(message.state, message.message));
    return;
  }
  if (message.type === 'validate') {
    await panel.webview.postMessage({
      type: 'validation',
      issues: validateProviderConfig(message.state.providers),
    });
    return;
  }
  if (message.type === 'save') {
    await saveProviders(message.state.providers);
    onSaved?.();
    postState(panel, { ...message.state, dirty: false });
    await panel.webview.postMessage({ type: 'validation', issues: [] });
    return;
  }
  if (message.type === 'openSettings') {
    vscode.commands.executeCommand('workbench.action.openSettings', 'copilot-model-bridge.providers');
  }
}

function postState(panel: vscode.WebviewPanel, state: ConfigManagerState): Thenable<boolean> {
  return panel.webview.postMessage({ type: 'state', state });
}

function isWebviewMessage(message: unknown): message is {
  type: 'ready' | 'mutate' | 'validate' | 'save' | 'openSettings';
  state: ConfigManagerState;
  message: Parameters<typeof reduceConfigManagerMessage>[1];
} {
  return typeof message === 'object' && message !== null && typeof (message as { type?: unknown }).type === 'string';
}

function createNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}
