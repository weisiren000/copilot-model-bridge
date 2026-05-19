import test from 'node:test';
import assert from 'node:assert/strict';
import { renderConfigManagerHtml } from '../configManagerHtml';

const FIXTURE = {
  cspSource: 'vscode-resource:',
  nonce: 'abc123',
  cssUris: [
    'vscode-resource://src/webview/configManager.base.css',
    'vscode-resource://src/webview/configManager.components.css',
    'vscode-resource://src/webview/configManager.dialogs.css',
  ],
  scriptUris: [
    'vscode-resource://src/webview/configManager.core.js',
    'vscode-resource://src/webview/configManager.inspector.js',
    'vscode-resource://src/webview/configManager.dialogs.js',
  ],
  logoUri: 'vscode-resource://images/logo.png',
};

test('renders config manager html with CSP and external resource references', () => {
  const html = renderConfigManagerHtml(FIXTURE);

  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'nonce-abc123'/);
  assert.match(html, /<link rel="stylesheet" href="vscode-resource:\/\/src\/webview\/configManager\.base\.css">/);
  assert.match(html, /<link rel="stylesheet" href="vscode-resource:\/\/src\/webview\/configManager\.components\.css">/);
  assert.match(html, /<link rel="stylesheet" href="vscode-resource:\/\/src\/webview\/configManager\.dialogs\.css">/);
  assert.match(html, /src="vscode-resource:\/\/src\/webview\/configManager\.core\.js"/);
  assert.match(html, /src="vscode-resource:\/\/src\/webview\/configManager\.inspector\.js"/);
  assert.match(html, /src="vscode-resource:\/\/src\/webview\/configManager\.dialogs\.js"/);
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
