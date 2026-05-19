import {
  duplicateModel,
  importModels,
  updateModel,
  updateProvider,
} from './configManagement';
import { ModelConfig, ProviderConfig } from './types';

export interface ConfigManagerState {
  providers: ProviderConfig[];
  selectedProviderId?: string;
  selectedModelId?: string;
  dirty: boolean;
}

export type ConfigManagerMessage =
  | { type: 'selectProvider'; providerId: string }
  | { type: 'selectModel'; providerId: string; modelId: string }
  | { type: 'addProvider' }
  | { type: 'deleteProvider'; providerId: string }
  | { type: 'updateProvider'; providerId: string; patch: Partial<ProviderConfig> }
  | { type: 'addModel'; providerId: string }
  | { type: 'deleteModel'; providerId: string; modelId: string }
  | { type: 'updateModel'; providerId: string; modelId: string; patch: Partial<ModelConfig> }
  | { type: 'duplicateModel'; providerId: string; modelId: string }
  | { type: 'importModels'; providerId: string; models: Array<Partial<ModelConfig> & Pick<ModelConfig, 'id' | 'name'>> }
  | { type: 'markSaved' };

export function reduceConfigManagerMessage(
  state: ConfigManagerState,
  message: ConfigManagerMessage
): ConfigManagerState {
  switch (message.type) {
    case 'selectProvider':
      return selectProvider(state, message.providerId);
    case 'selectModel':
      return { ...state, selectedProviderId: message.providerId, selectedModelId: message.modelId };
    case 'addProvider':
      return addProviderState(state);
    case 'deleteProvider':
      return deleteProviderState(state, message.providerId);
    case 'updateProvider':
      return updateProviderState(state, message.providerId, message.patch);
    case 'addModel':
      return addModelState(state, message.providerId);
    case 'deleteModel':
      return deleteModelState(state, message.providerId, message.modelId);
    case 'updateModel':
      return updateModelState(state, message.providerId, message.modelId, message.patch);
    case 'duplicateModel':
      return duplicateModelState(state, message.providerId, message.modelId);
    case 'importModels':
      return markDirty(state, importModels(state.providers, message.providerId, normalizeImportedModels(message.models)));
    case 'markSaved':
      return { ...state, dirty: false };
  }
}

export function createInitialConfigManagerState(providers: ProviderConfig[]): ConfigManagerState {
  const selectedProvider = providers[0];
  return {
    providers,
    selectedProviderId: selectedProvider?.id,
    selectedModelId: selectedProvider?.models[0]?.id,
    dirty: false,
  };
}

function selectProvider(state: ConfigManagerState, providerId: string): ConfigManagerState {
  const provider = state.providers.find(candidate => candidate.id === providerId);
  return {
    ...state,
    selectedProviderId: providerId,
    selectedModelId: provider?.models[0]?.id,
  };
}

function addProviderState(state: ConfigManagerState): ConfigManagerState {
  const providerId = createUniqueId('provider', state.providers.map(provider => provider.id));
  const provider: ProviderConfig = {
    id: providerId,
    displayName: 'New Provider',
    baseUrl: 'https://example.com/v1',
    apiKey: '',
    models: [],
  };
  return {
    providers: [...state.providers, provider],
    selectedProviderId: providerId,
    selectedModelId: undefined,
    dirty: true,
  };
}

function updateProviderState(
  state: ConfigManagerState,
  providerId: string,
  patch: Partial<ProviderConfig>
): ConfigManagerState {
  const providers = updateProvider(state.providers, providerId, patch);
  return {
    ...markDirty(state, providers),
    selectedProviderId: patch.id ?? state.selectedProviderId,
  };
}

function deleteProviderState(state: ConfigManagerState, providerId: string): ConfigManagerState {
  const providers = state.providers.filter(provider => provider.id !== providerId);
  const selectedProvider = providers[0];
  return {
    providers,
    selectedProviderId: selectedProvider?.id,
    selectedModelId: selectedProvider?.models[0]?.id,
    dirty: true,
  };
}

function addModelState(state: ConfigManagerState, providerId: string): ConfigManagerState {
  const provider = state.providers.find(candidate => candidate.id === providerId);
  const modelId = createUniqueId('model', provider?.models.map(model => model.id) ?? []);
  const model: ModelConfig = {
    id: modelId,
    name: 'New Model',
    maxInputTokens: 128000,
    maxOutputTokens: 4096,
    supportsToolCalling: true,
    supportsVision: false,
  };
  const providers = state.providers.map(candidate => (
    candidate.id === providerId
      ? { ...candidate, models: [...candidate.models, model] }
      : candidate
  ));
  return { providers, selectedProviderId: providerId, selectedModelId: modelId, dirty: true };
}

function updateModelState(
  state: ConfigManagerState,
  providerId: string,
  modelId: string,
  patch: Partial<ModelConfig>
): ConfigManagerState {
  const providers = updateModel(state.providers, providerId, modelId, patch);
  return {
    ...markDirty(state, providers),
    selectedModelId: patch.id ?? state.selectedModelId,
  };
}

function deleteModelState(
  state: ConfigManagerState,
  providerId: string,
  modelId: string
): ConfigManagerState {
  const providers = state.providers.map(provider => (
    provider.id === providerId
      ? { ...provider, models: provider.models.filter(model => model.id !== modelId) }
      : provider
  ));
  const provider = providers.find(candidate => candidate.id === providerId);
  return {
    providers,
    selectedProviderId: providerId,
    selectedModelId: provider?.models[0]?.id,
    dirty: true,
  };
}

function duplicateModelState(
  state: ConfigManagerState,
  providerId: string,
  modelId: string
): ConfigManagerState {
  const provider = state.providers.find(candidate => candidate.id === providerId);
  const duplicateId = createUniqueId(`${modelId}-copy`, provider?.models.map(model => model.id) ?? []);
  const source = provider?.models.find(model => model.id === modelId);
  const duplicateName = source ? `${source.name} Copy` : 'Model Copy';
  return {
    providers: duplicateModel(state.providers, providerId, modelId, duplicateId, duplicateName),
    selectedProviderId: providerId,
    selectedModelId: duplicateId,
    dirty: true,
  };
}

function normalizeImportedModels(
  models: Array<Partial<ModelConfig> & Pick<ModelConfig, 'id' | 'name'>>
): ModelConfig[] {
  return models.map(model => ({
    ...model,
    id: model.id,
    name: model.name,
    maxInputTokens: model.maxInputTokens ?? 128000,
    maxOutputTokens: model.maxOutputTokens ?? 4096,
    supportsToolCalling: model.supportsToolCalling ?? true,
  }));
}

function markDirty(state: ConfigManagerState, providers: ProviderConfig[]): ConfigManagerState {
  return { ...state, providers, dirty: true };
}

function createUniqueId(base: string, existingIds: readonly string[]): string {
  const existing = new Set(existingIds);
  if (!existing.has(base)) {
    return base;
  }

  let index = 2;
  while (existing.has(`${base}-${index}`)) {
    index++;
  }
  return `${base}-${index}`;
}
