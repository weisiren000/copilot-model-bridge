import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import { selectConfiguredProviders } from '../provider/config/cmb.provider.configKeys';
import { ProviderConfig } from '../types';

let storedProviders: ProviderConfig[] | undefined;
const vscodeMock = {
  ConfigurationTarget: {
    Global: 1,
  },
  workspace: {
    getConfiguration(section: string) {
      return {
        get(key: string) {
          if (section === 'copilot-model-bridge' && key === 'providers') {
            return storedProviders;
          }
          return undefined;
        },
        async update(key: string, value: ProviderConfig[]) {
          if (key === 'providers') {
            storedProviders = value;
          }
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
  getProviders,
} = require('../provider/config/cmb.provider.settings') as typeof import('../provider/config/cmb.provider.settings');

const legacyProviders: ProviderConfig[] = [{
  id: 'legacy',
  displayName: 'Legacy',
  baseUrl: 'http://localhost:11434/v1',
  apiKey: '',
  models: [],
}];

const renamedProviders: ProviderConfig[] = [{
  id: 'renamed',
  displayName: 'Renamed',
  baseUrl: 'https://example.com/v1',
  apiKey: 'key',
  models: [],
}];

test('prefers renamed provider configuration over legacy configuration', () => {
  assert.equal(selectConfiguredProviders(renamedProviders, legacyProviders), renamedProviders);
});

test('falls back to legacy provider configuration during rename migration', () => {
  assert.equal(selectConfiguredProviders(undefined, legacyProviders), legacyProviders);
});

test('returns an empty provider list when neither configuration key is set', () => {
  assert.deepEqual(selectConfiguredProviders(undefined, undefined), []);
});

test('preserves provider apiStyle when reading settings', () => {
  storedProviders = [{
    id: 'openai',
    displayName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1/',
    apiKey: 'key',
    apiStyle: 'responses',
    models: [],
  }];

  assert.deepEqual(getProviders()[0], {
    id: 'openai',
    displayName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'key',
    apiStyle: 'responses',
    models: [],
  });
});
