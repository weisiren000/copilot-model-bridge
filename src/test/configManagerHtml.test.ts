import test from 'node:test';
import assert from 'node:assert/strict';
import { renderConfigManagerHtml } from '../configManagerHtml';

test('renders config manager html with CSP and vscode state persistence hooks', () => {
  const html = renderConfigManagerHtml({
    cspSource: 'vscode-resource:',
    nonce: 'abc123',
  });

  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'nonce-abc123'/);
  assert.match(html, /acquireVsCodeApi\(\)/);
  assert.match(html, /getState\(\)/);
  assert.match(html, /setState/);
});

test('renders provider, model, validation, import, and save controls', () => {
  const html = renderConfigManagerHtml({
    cspSource: 'vscode-resource:',
    nonce: 'abc123',
  });

  for (const text of [
    'Providers',
    'Models',
    'Provider',
    'Model',
    'Validate',
    'Save',
    'Import JSON',
    'Duplicate',
    'Delete Provider',
    'Delete',
    'Open Settings JSON',
  ]) {
    assert.match(html, new RegExp(text));
  }
});
