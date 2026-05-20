import test from 'node:test';
import assert from 'node:assert/strict';
import { selectConfiguredProviders } from '../provider/config/cmb.provider.configKeys';
import { ProviderConfig } from '../types';

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
