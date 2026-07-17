import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('publishes without proposed VS Code API dependencies', () => {
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), 'package.json'), 'utf8')
  ) as {
    enabledApiProposals?: unknown;
    engines: { vscode: string };
    devDependencies: { '@types/vscode': string };
  };

  assert.equal(manifest.enabledApiProposals, undefined);
  assert.equal(manifest.engines.vscode, '^1.115.0');
  assert.equal(manifest.devDependencies['@types/vscode'], '1.115.0');
});
