import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
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
    'dialog-api-style',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test('renders model modal with context window, output, and calculated input fields', () => {
  const html = renderConfigManagerHtml(FIXTURE);

  assert.match(html, /上下文窗口 Tokens/);
  assert.match(html, /最大输出 Tokens/);
  assert.match(html, /可用输入 Tokens/);
  assert.match(html, /设置厂商公布的总上下文窗口和最大输出上限/);
  assert.match(html, /id="dialog-context-window"/);
  assert.match(html, /id="dialog-max-output"/);
  assert.match(html, /id="dialog-available-input"[^>]*readonly/);
  assert.doesNotMatch(html, /id="dialog-max-input"/);
});

test('provides an xAI Grok preset using the Responses API', () => {
  const source = readFileSync(join(
    process.cwd(),
    'src/webview/configManager/cmb.configManager.dialogShared.js'
  ), 'utf8');
  const context = {
    window: { CMB: {} as Record<string, unknown> },
    document: {},
    console,
  };
  vm.runInNewContext(source, context);
  const cmb = context.window.CMB as {
    dialogShared: {
      PROVIDER_PRESETS: Record<string, Record<string, unknown>>;
    };
  };

  assert.deepEqual(
    { ...cmb.dialogShared.PROVIDER_PRESETS.xai },
    {
      label: 'xAI（Grok / Responses API）',
      name: 'xAI',
      baseUrl: 'https://api.x.ai/v1',
      idHint: 'xai',
      apiKeyHint: 'xai-...',
      apiStyle: 'responses',
    }
  );
});

test('uses a model profile context window with the editable default request cap', () => {
  const source = readFileSync(join(
    process.cwd(),
    'src/webview/configManager/cmb.configManager.dialogShared.js'
  ), 'utf8');
  const context = {
    window: {
      CMB: {
        calculateContextWindowTokens: (input: number, output: number) => input + output,
        calculateMaxInputTokens: (contextWindow: number, output: number) => contextWindow - output,
      },
    },
    document: {},
    console,
  };
  vm.runInNewContext(source, context);
  const cmb = context.window.CMB as typeof context.window.CMB & {
    dialogShared: {
      resolveSuggestionTokenLimits(defaults: Record<string, unknown>): Record<string, number>;
    };
  };

  assert.deepEqual(
    { ...cmb.dialogShared.resolveSuggestionTokenLimits({ contextWindowTokens: 500000 }) },
    {
      contextWindowTokens: 500000,
      maxOutputTokens: 4096,
      maxInputTokens: 495904,
    }
  );
});

test('converts between context window and provider token limits', () => {
  const source = readFileSync(join(
    process.cwd(),
    'src/webview/configManager/cmb.configManager.dom.js'
  ), 'utf8');
  const context = {
    window: { CMB: {} as Record<string, unknown> },
    document: { getElementById: () => undefined },
    console,
    URL,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(source, context);
  const cmb = context.window.CMB as {
    calculateContextWindowTokens(maxInputTokens: number, maxOutputTokens: number): number;
    calculateMaxInputTokens(contextWindowTokens: number, maxOutputTokens: number): number;
    isValidTokenLimits(contextWindowTokens: number, maxOutputTokens: number): boolean;
  };

  assert.equal(cmb.calculateContextWindowTokens(343000, 128000), 471000);
  assert.equal(cmb.calculateMaxInputTokens(471000, 128000), 343000);
  assert.equal(cmb.calculateContextWindowTokens(128000, 4096), 132096);
  assert.equal(cmb.isValidTokenLimits(471000, 128000), true);
  assert.equal(cmb.isValidTokenLimits(128000, 128000), false);
  assert.equal(cmb.isValidTokenLimits(Number.MAX_SAFE_INTEGER + 1, 4096), false);
});
