import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ConfigManagerState,
  reduceConfigManagerMessage,
} from '../configManager';

function createState(): ConfigManagerState {
  return {
    providers: [{
      id: 'openrouter',
      displayName: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'key',
      models: [{
        id: 'openai/gpt-4.1',
        name: 'GPT-4.1',
        maxInputTokens: 128000,
        maxOutputTokens: 4096,
        supportsToolCalling: true,
        customField: 'keep-me',
      } as never],
    }],
    selectedProviderId: 'openrouter',
    selectedModelId: 'openai/gpt-4.1',
    dirty: false,
  };
}

test('updates provider fields and marks state dirty', () => {
  const state = reduceConfigManagerMessage(createState(), {
    type: 'updateProvider',
    providerId: 'openrouter',
    patch: { displayName: 'OpenRouter BYOK' },
  });

  assert.equal(state.providers[0].displayName, 'OpenRouter BYOK');
  assert.equal(state.dirty, true);
});

test('keeps provider selection when provider id is edited', () => {
  const state = reduceConfigManagerMessage(createState(), {
    type: 'updateProvider',
    providerId: 'openrouter',
    patch: { id: 'openrouter-updated' },
  });

  assert.equal(state.providers[0].id, 'openrouter-updated');
  assert.equal(state.selectedProviderId, 'openrouter-updated');
});

test('updates model fields while preserving unknown model fields', () => {
  const state = reduceConfigManagerMessage(createState(), {
    type: 'updateModel',
    providerId: 'openrouter',
    modelId: 'openai/gpt-4.1',
    patch: { name: 'GPT-4.1 Updated' },
  });

  assert.equal(state.providers[0].models[0].name, 'GPT-4.1 Updated');
  assert.equal((state.providers[0].models[0] as unknown as { customField: string }).customField, 'keep-me');
  assert.equal(state.dirty, true);
});

test('updates max input tokens directly', () => {
  const state = reduceConfigManagerMessage(createState(), {
    type: 'updateModel',
    providerId: 'openrouter',
    modelId: 'openai/gpt-4.1',
    patch: { maxInputTokens: 1000000 },
  });

  assert.equal(state.providers[0].models[0].maxInputTokens, 1000000);
});

test('updates max output tokens without changing max input tokens', () => {
  const state = reduceConfigManagerMessage(createState(), {
    type: 'updateModel',
    providerId: 'openrouter',
    modelId: 'openai/gpt-4.1',
    patch: { maxOutputTokens: 8192 },
  });

  assert.equal(state.providers[0].models[0].maxInputTokens, 128000);
  assert.equal(state.providers[0].models[0].maxOutputTokens, 8192);
});

test('keeps model selection when model id is edited', () => {
  const state = reduceConfigManagerMessage(createState(), {
    type: 'updateModel',
    providerId: 'openrouter',
    modelId: 'openai/gpt-4.1',
    patch: { id: 'openai/gpt-4.1-updated' },
  });

  assert.equal(state.providers[0].models[0].id, 'openai/gpt-4.1-updated');
  assert.equal(state.selectedModelId, 'openai/gpt-4.1-updated');
});

test('adds provider and selects it', () => {
  const state = reduceConfigManagerMessage(createState(), {
    type: 'addProvider',
  });

  assert.equal(state.providers.length, 2);
  assert.equal(state.selectedProviderId, state.providers[1].id);
  assert.equal(state.selectedModelId, undefined);
  assert.equal(state.dirty, true);
});

test('duplicates selected model and selects the duplicate', () => {
  const state = reduceConfigManagerMessage(createState(), {
    type: 'duplicateModel',
    providerId: 'openrouter',
    modelId: 'openai/gpt-4.1',
  });

  assert.equal(state.providers[0].models.length, 2);
  assert.match(state.providers[0].models[1].id, /copy/);
  assert.equal(state.selectedModelId, state.providers[0].models[1].id);
  assert.equal((state.providers[0].models[1] as unknown as { customField: string }).customField, 'keep-me');
});

test('imports only new models and keeps current selection stable', () => {
  const state = reduceConfigManagerMessage(createState(), {
    type: 'importModels',
    providerId: 'openrouter',
    models: [
      { id: 'openai/gpt-4.1', name: 'Duplicate' },
      { id: 'anthropic/claude-sonnet', name: 'Claude Sonnet' },
    ],
  });

  assert.deepEqual(state.providers[0].models.map(model => model.id), [
    'openai/gpt-4.1',
    'anthropic/claude-sonnet',
  ]);
  assert.equal(state.selectedModelId, 'openai/gpt-4.1');
});
