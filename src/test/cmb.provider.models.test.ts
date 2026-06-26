import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import { ProviderConfig } from '../types';

let storedProviders: ProviderConfig[] = [];

class ThemeIcon {
  constructor(readonly id: string) {}
}

const vscodeMock = {
  ThemeIcon,
  workspace: {
    getConfiguration(section: string) {
      return {
        get(key: string) {
          if (section === 'copilot-model-bridge' && key === 'providers') {
            return storedProviders;
          }
          return undefined;
        },
      };
    },
  },
};

const moduleLoader = Module as unknown as {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
};
const originalLoad = moduleLoader._load;
moduleLoader._load = function loadWithVscodeMock(
  request: string,
  parent: unknown,
  isMain: boolean
): unknown {
  if (request === 'vscode') {
    return vscodeMock;
  }
  return originalLoad.call(this, request, parent, isMain);
};

const {
  buildModelList,
} = require('../provider/core/cmb.provider.models') as typeof import('../provider/core/cmb.provider.models');

test('builds picker metadata with VS Code compatible category and status icon', () => {
  storedProviders = [{
    id: 'provider',
    displayName: 'Provider',
    baseUrl: 'https://example.com/v1',
    apiKey: 'key',
    models: [{
      id: 'reasoner',
      name: 'Reasoner',
      maxInputTokens: 64000,
      maxOutputTokens: 8192,
      supportsToolCalling: true,
      categoryLabel: 'Reasoning',
      categoryOrder: 10,
      statusIcon: 'sparkle',
    }],
  }];

  const [model] = buildModelList() as Array<{
    category?: unknown;
    categoryOrder?: unknown;
    statusIcon?: unknown;
  }>;

  assert.equal(model.category, 'Reasoning');
  assert.equal(model.categoryOrder, undefined);
  assert.ok(model.statusIcon instanceof ThemeIcon);
  assert.equal((model.statusIcon as ThemeIcon).id, 'sparkle');
});

