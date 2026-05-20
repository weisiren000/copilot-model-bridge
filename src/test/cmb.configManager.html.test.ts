import test from 'node:test';
import assert from 'node:assert/strict';
import { renderConfigManagerHtml } from '../configManager';

const FIXTURE = {
  cspSource: 'vscode-resource:',
  nonce: 'abc123',
  cssUris: [
    'vscode-resource://src/webview/styles/cmb.configManager.tokens.css',
    'vscode-resource://src/webview/styles/cmb.configManager.layout.css',
    'vscode-resource://src/webview/styles/cmb.configManager.buttons.css',
    'vscode-resource://src/webview/styles/cmb.configManager.forms.css',
    'vscode-resource://src/webview/styles/cmb.configManager.lists.css',
    'vscode-resource://src/webview/styles/cmb.configManager.dialogs.css',
    'vscode-resource://src/webview/styles/cmb.configManager.inspector.css',
    'vscode-resource://src/webview/styles/cmb.configManager.utilities.css',
  ],
  scriptUris: [
    'vscode-resource://src/webview/configManager/cmb.configManager.state.js',
    'vscode-resource://src/webview/configManager/cmb.configManager.dom.js',
    'vscode-resource://src/webview/configManager/cmb.configManager.renderProviders.js',
    'vscode-resource://src/webview/configManager/cmb.configManager.renderModels.js',
    'vscode-resource://src/webview/configManager/cmb.configManager.dialogShared.js',
    'vscode-resource://src/webview/configManager/cmb.configManager.dialogProvider.js',
    'vscode-resource://src/webview/configManager/cmb.configManager.dialogModel.js',
    'vscode-resource://src/webview/configManager/cmb.configManager.inspectorExport.js',
    'vscode-resource://src/webview/configManager/cmb.configManager.inspectorFormat.js',
    'vscode-resource://src/webview/configManager/cmb.configManager.inspectorPreview.js',
    'vscode-resource://src/webview/configManager/cmb.configManager.events.js',
  ],
  logoUri: 'vscode-resource://images/logo.png',
};

test('renders config manager html with CSP and external resource references', () => {
  const html = renderConfigManagerHtml(FIXTURE);

  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'nonce-abc123'/);
  assert.match(html, /<link rel="stylesheet" href="vscode-resource:\/\/src\/webview\/styles\/cmb\.configManager\.tokens\.css">/);
  assert.match(html, /<link rel="stylesheet" href="vscode-resource:\/\/src\/webview\/styles\/cmb\.configManager\.layout\.css">/);
  assert.match(html, /<link rel="stylesheet" href="vscode-resource:\/\/src\/webview\/styles\/cmb\.configManager\.buttons\.css">/);
  assert.match(html, /<link rel="stylesheet" href="vscode-resource:\/\/src\/webview\/styles\/cmb\.configManager\.forms\.css">/);
  assert.match(html, /<link rel="stylesheet" href="vscode-resource:\/\/src\/webview\/styles\/cmb\.configManager\.lists\.css">/);
  assert.match(html, /<link rel="stylesheet" href="vscode-resource:\/\/src\/webview\/styles\/cmb\.configManager\.dialogs\.css">/);
  assert.match(html, /<link rel="stylesheet" href="vscode-resource:\/\/src\/webview\/styles\/cmb\.configManager\.inspector\.css">/);
  assert.match(html, /<link rel="stylesheet" href="vscode-resource:\/\/src\/webview\/styles\/cmb\.configManager\.utilities\.css">/);
  assert.match(html, /src="vscode-resource:\/\/src\/webview\/configManager\/cmb\.configManager\.state\.js"/);
  assert.match(html, /src="vscode-resource:\/\/src\/webview\/configManager\/cmb\.configManager\.dom\.js"/);
  assert.match(html, /src="vscode-resource:\/\/src\/webview\/configManager\/cmb\.configManager\.renderProviders\.js"/);
  assert.match(html, /src="vscode-resource:\/\/src\/webview\/configManager\/cmb\.configManager\.renderModels\.js"/);
  assert.match(html, /src="vscode-resource:\/\/src\/webview\/configManager\/cmb\.configManager\.dialogShared\.js"/);
  assert.match(html, /src="vscode-resource:\/\/src\/webview\/configManager\/cmb\.configManager\.dialogProvider\.js"/);
  assert.match(html, /src="vscode-resource:\/\/src\/webview\/configManager\/cmb\.configManager\.dialogModel\.js"/);
  assert.match(html, /src="vscode-resource:\/\/src\/webview\/configManager\/cmb\.configManager\.inspectorExport\.js"/);
  assert.match(html, /src="vscode-resource:\/\/src\/webview\/configManager\/cmb\.configManager\.inspectorFormat\.js"/);
  assert.match(html, /src="vscode-resource:\/\/src\/webview\/configManager\/cmb\.configManager\.inspectorPreview\.js"/);
  assert.match(html, /src="vscode-resource:\/\/src\/webview\/configManager\/cmb\.configManager\.events\.js"/);
  assert.match(html, /src="vscode-resource:\/\/images\/logo\.png"/);
});

test('renders provider, model, validation, import, and save controls by element ids', () => {
  const html = renderConfigManagerHtml(FIXTURE);

  for (const id of [
    'btn-validate',
    'btn-save',
    'btn-open-settings',
    'btn-add-provider',
    'btn-add-model',
    'btn-import-json',
    'provider-modal',
    'model-modal',
    'preset-select',
    'btn-fetch-models',
    'model-suggestions',
    'json-input',
    'inspector-body',
    'issues',
    'health',
    'providers',
    'models',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test('renders model modal with max input and max output token fields', () => {
  const html = renderConfigManagerHtml(FIXTURE);

  assert.match(html, /最大输入 Tokens/);
  assert.match(html, /最大输出 Tokens/);
  assert.match(html, /设置模型可输入上限和输出上限/);
  assert.doesNotMatch(html, /最大上下文 Tokens/);
  assert.doesNotMatch(html, /id="dialog-context-window"/);
  assert.match(html, /id="dialog-max-input"/);
  assert.match(html, /id="dialog-max-output"/);
});
