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

test('publishes only stable VS Code model metadata', () => {
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

  const [model] = buildModelList() as unknown as Array<{
    capabilities: Record<string, unknown>;
    category?: unknown;
    categoryOrder?: unknown;
    statusIcon?: unknown;
    configurationSchema?: unknown;
    editTools?: unknown;
    isUserSelectable?: unknown;
    multiplier?: unknown;
    multiplierNumeric?: unknown;
  }>;

  assert.equal(model.category, undefined);
  assert.equal(model.categoryOrder, undefined);
  assert.equal(model.statusIcon, undefined);
  assert.equal(model.configurationSchema, undefined);
  assert.equal(model.isUserSelectable, undefined);
  assert.equal(model.multiplier, undefined);
  assert.equal(model.multiplierNumeric, undefined);
  assert.deepEqual(model.capabilities, {
    toolCalling: true,
    imageInput: false,
  });
});
