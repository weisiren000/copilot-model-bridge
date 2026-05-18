import test from 'node:test';
import assert from 'node:assert/strict';
import {
  duplicateModel,
  importModels,
  updateModel,
  updateProvider,
  validateProviderConfig,
} from '../configManagement';
import { ProviderConfig } from '../types';

function createProviders(): ProviderConfig[] {
  return [{
    id: 'provider',
    displayName: 'Provider',
    baseUrl: 'https://example.com/v1',
    apiKey: 'key',
    models: [{
      id: 'model-a',
      name: 'Model A',
      maxInputTokens: 128000,
      maxOutputTokens: 4096,
      supportsToolCalling: true,
      customField: 'keep-me',
    } as never],
  }];
}

test('updates provider fields without removing provider models', () => {
  const updated = updateProvider(createProviders(), 'provider', {
    displayName: 'Renamed Provider',
  });

  assert.equal(updated[0].displayName, 'Renamed Provider');
  assert.equal(updated[0].models.length, 1);
});

test('updates model fields while preserving unknown user fields', () => {
  const updated = updateModel(createProviders(), 'provider', 'model-a', {
    name: 'Renamed Model',
  });

  assert.equal(updated[0].models[0].name, 'Renamed Model');
  assert.equal((updated[0].models[0] as never as { customField: string }).customField, 'keep-me');
});

test('duplicates models without mutating the source model', () => {
  const updated = duplicateModel(
    createProviders(),
    'provider',
    'model-a',
    'model-b',
    'Model B'
  );

  assert.equal(updated[0].models.length, 2);
  assert.equal(updated[0].models[0].id, 'model-a');
  assert.equal(updated[0].models[1].id, 'model-b');
  assert.equal((updated[0].models[1] as never as { customField: string }).customField, 'keep-me');
});

test('imports only models that do not already exist', () => {
  const updated = importModels(createProviders(), 'provider', [
    {
      id: 'model-a',
      name: 'Existing',
      maxInputTokens: 1,
      maxOutputTokens: 1,
      supportsToolCalling: false,
    },
    {
      id: 'model-c',
      name: 'Model C',
      maxInputTokens: 8000,
      maxOutputTokens: 4096,
      supportsToolCalling: true,
    },
  ]);

  assert.deepEqual(updated[0].models.map(model => model.id), ['model-a', 'model-c']);
});

test('validates duplicate model ids, invalid urls, and reasoning mismatches', () => {
  const issues = validateProviderConfig([{
    id: 'bad-provider',
    displayName: 'Bad Provider',
    baseUrl: 'not a url',
    apiKey: '',
    models: [
      {
        id: 'dup',
        name: 'Duplicate 1',
        maxInputTokens: 1,
        maxOutputTokens: 1,
        supportsToolCalling: true,
        supportsReasoning: true,
        supportedReasoningLevels: ['low'],
        defaultReasoningLevel: 'high',
      },
      {
        id: 'dup',
        name: 'Duplicate 2',
        maxInputTokens: 1,
        maxOutputTokens: 1,
        supportsToolCalling: true,
      },
    ],
  }]);

  assert.equal(issues.filter(issue => issue.severity === 'error').length, 3);
  assert.match(issues[0].message, /invalid base URL/);
  assert.match(issues[1].message, /duplicate model id/);
  assert.match(issues[2].message, /default reasoning level/);
});

test('validates attachment policy flags that request conversion cannot honor yet', () => {
  const issues = validateProviderConfig([{
    id: 'provider',
    displayName: 'Provider',
    baseUrl: 'https://example.com/v1',
    apiKey: '',
    models: [{
      id: 'video-model',
      name: 'Video Model',
      maxInputTokens: 1,
      maxOutputTokens: 1,
      supportsToolCalling: true,
      supportsVision: true,
      supportsVideo: true,
      supportsFileInput: true,
    }],
  }]);

  assert.equal(issues.length, 2);
  assert.match(issues[0].message, /video support/);
  assert.match(issues[1].message, /generic file input/);
});
