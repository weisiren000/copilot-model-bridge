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
import { fetchOpenAIModelList } from './openaiModels';

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

  const panel = createPanel(context);
  currentPanel = panel;
  panel.webview.html = buildPanelHtml(context, panel);

  panel.onDidDispose(() => {
    currentPanel = undefined;
  }, undefined, context.subscriptions);

  panel.webview.onDidReceiveMessage(async message => {
    await handleWebviewMessage(panel, message, onSaved);
  }, undefined, context.subscriptions);
}

function createPanel(context: vscode.ExtensionContext): vscode.WebviewPanel {
  return vscode.window.createWebviewPanel(
    VIEW_TYPE,
    'Copilot Model Bridge 配置',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'src', 'webview'),
        vscode.Uri.joinPath(context.extensionUri, 'images'),
      ],
    }
  );
}

function buildPanelHtml(context: vscode.ExtensionContext, panel: vscode.WebviewPanel): string {
  const cssUris = [
    'configManager.base.css',
    'configManager.components.css',
    'configManager.dialogs.css',
  ].map((file) => panel.webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'src', 'webview', file)
  ).toString());
  const scriptUris = [
    'configManager.core.js',
    'configManager.inspector.js',
    'configManager.dialogs.js',
  ].map((file) => panel.webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'src', 'webview', file)
  ).toString());
  const logoUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'images', 'logo.png')
  );
  return renderConfigManagerHtml({
    cspSource: panel.webview.cspSource,
    nonce: createNonce(),
    cssUris,
    scriptUris,
    logoUri: logoUri.toString(),
  });
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
    const result = await maybeConfirmDestructive(message);
    if (result === 'cancelled') {
      await panel.webview.postMessage({ type: 'toast', message: '已取消', severity: 'info' });
      return;
    }
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
    await handleSave(panel, message.state, onSaved);
    return;
  }
  if (message.type === 'openSettings') {
    vscode.commands.executeCommand('workbench.action.openSettings', 'copilot-model-bridge.providers');
    return;
  }
  if (message.type === 'fetchModels') {
    await handleFetchModels(panel, message);
    return;
  }
}

async function handleSave(
  panel: vscode.WebviewPanel,
  state: ConfigManagerState,
  onSaved?: () => void
): Promise<void> {
  try {
    await saveProviders(state.providers);
    onSaved?.();
    postState(panel, { ...state, dirty: false });
    await panel.webview.postMessage({ type: 'validation', issues: [] });
    await panel.webview.postMessage({ type: 'toast', message: '配置已保存', severity: 'info' });
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    await panel.webview.postMessage({ type: 'toast', message: `保存失败：${text}`, severity: 'error' });
  }
}

async function handleFetchModels(
  panel: vscode.WebviewPanel,
  message: FetchModelsMessage
): Promise<void> {
  const result = await fetchOpenAIModelList({
    baseUrl: message.baseUrl,
    apiKey: message.apiKey,
  });
  await panel.webview.postMessage({
    type: 'modelsList',
    token: message.token,
    models: result.models,
    error: result.ok ? undefined : result.error,
  });
}

function postState(panel: vscode.WebviewPanel, state: ConfigManagerState): Thenable<boolean> {
  return panel.webview.postMessage({ type: 'state', state });
}

type ConfirmResult = 'confirmed' | 'cancelled' | 'not-applicable';

async function maybeConfirmDestructive(
  message: { state: ConfigManagerState; message: Parameters<typeof reduceConfigManagerMessage>[1] }
): Promise<ConfirmResult> {
  const inner = message.message;
  if (inner.type === 'deleteProvider') {
    const provider = message.state.providers.find(p => p.id === inner.providerId);
    if (!provider) return 'not-applicable';
    const modelCount = provider.models.length;
    return confirmDelete(
      `删除 Provider "${provider.displayName}"？`,
      modelCount > 0
        ? `该 Provider 下的 ${modelCount} 个模型也会一并移除。`
        : '该操作不可撤销。'
    );
  }
  if (inner.type === 'deleteModel') {
    const provider = message.state.providers.find(p => p.id === inner.providerId);
    const model = provider?.models.find(m => m.id === inner.modelId);
    if (!provider || !model) return 'not-applicable';
    return confirmDelete(`删除模型 "${model.name}"？`, '该操作不可撤销。');
  }
  return 'not-applicable';
}

async function confirmDelete(prompt: string, detail: string): Promise<ConfirmResult> {
  const choice = await vscode.window.showWarningMessage(
    prompt,
    { modal: true, detail },
    '删除'
  );
  return choice === '删除' ? 'confirmed' : 'cancelled';
}

interface FetchModelsMessage {
  type: 'fetchModels';
  token: number;
  baseUrl: string;
  apiKey?: string;
}

type WebviewMessage =
  | { type: 'ready' }
  | { type: 'mutate'; state: ConfigManagerState; message: Parameters<typeof reduceConfigManagerMessage>[1] }
  | { type: 'validate'; state: ConfigManagerState }
  | { type: 'save'; state: ConfigManagerState }
  | { type: 'openSettings' }
  | FetchModelsMessage;

function isWebviewMessage(message: unknown): message is WebviewMessage {
  return typeof message === 'object'
    && message !== null
    && typeof (message as { type?: unknown }).type === 'string';
}

function createNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}
