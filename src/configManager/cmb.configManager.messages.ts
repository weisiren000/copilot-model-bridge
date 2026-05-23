import {
  duplicateModel,
  importModels,
  updateModel,
  updateProvider,
} from '../provider/config/cmb.provider.configManagement';
import { ModelConfig, ProviderConfig } from '../types';

export interface ConfigManagerState {
  providers: ProviderConfig[];
  selectedProviderId?: string;
  selectedModelProviderId?: string;
  selectedModelId?: string;
  dirty: boolean;
}

export type ConfigManagerMessage =
  | { type: 'selectProvider'; providerId: string }
  | { type: 'selectModel'; providerId: string; modelId: string }
  | { type: 'addProvider' }
  | { type: 'createProvider'; provider: ProviderConfig; initialModels?: Array<Partial<ModelConfig> & Pick<ModelConfig, 'id' | 'name'>> }
  | { type: 'deleteProvider'; providerId: string }
  | { type: 'updateProvider'; providerId: string; patch: Partial<ProviderConfig> }
  | { type: 'addModel'; providerId: string }
  | { type: 'createModel'; providerId: string; model: Partial<ModelConfig> & Pick<ModelConfig, 'id' | 'name'> }
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
      return selectModel(state, message.providerId, message.modelId);
    case 'addProvider':
      return addProviderState(state);
    case 'createProvider':
      return createProviderState(state, message.provider, message.initialModels);
    case 'deleteProvider':
      return deleteProviderState(state, message.providerId);
    case 'updateProvider':
      return updateProviderState(state, message.providerId, message.patch);
    case 'addModel':
      return addModelState(state, message.providerId);
    case 'createModel':
      return createModelState(state, message.providerId, message.model);
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
    selectedModelProviderId: undefined,
    selectedModelId: undefined,
    dirty: false,
  };
}

function selectProvider(state: ConfigManagerState, providerId: string): ConfigManagerState {
  return {
    ...state,
    selectedProviderId: providerId,
    selectedModelProviderId: undefined,
    selectedModelId: undefined,
  };
}

function selectModel(
  state: ConfigManagerState,
  providerId: string,
  modelId: string
): ConfigManagerState {
  return {
    ...state,
    selectedProviderId: undefined,
    selectedModelProviderId: providerId,
    selectedModelId: modelId,
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
    selectedModelProviderId: undefined,
    selectedModelId: undefined,
    dirty: true,
  };
}

function createProviderState(
  state: ConfigManagerState,
  provider: ProviderConfig,
  initialModels?: Array<Partial<ModelConfig> & Pick<ModelConfig, 'id' | 'name'>>
): ConfigManagerState {
  if (state.providers.some(existing => existing.id === provider.id)) {
    return state;
  }
  const models = initialModels ? normalizeImportedModels(initialModels) : [];
  const newProvider: ProviderConfig = { ...provider, models };
  return {
    providers: [...state.providers, newProvider],
    selectedProviderId: models.length > 0 ? undefined : newProvider.id,
    selectedModelProviderId: models.length > 0 ? newProvider.id : undefined,
    selectedModelId: models[0]?.id,
    dirty: true,
  };
}

function createModelState(
  state: ConfigManagerState,
  providerId: string,
  model: Partial<ModelConfig> & Pick<ModelConfig, 'id' | 'name'>
): ConfigManagerState {
  const provider = state.providers.find(candidate => candidate.id === providerId);
  if (!provider) return state;
  if (provider.models.some(existing => existing.id === model.id)) return state;
  const [normalized] = normalizeImportedModels([model]);
  const providers = state.providers.map(candidate => (
    candidate.id === providerId
      ? { ...candidate, models: [...candidate.models, normalized] }
      : candidate
  ));
  return {
    providers,
    selectedProviderId: undefined,
    selectedModelProviderId: providerId,
    selectedModelId: normalized.id,
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
    selectedModelProviderId: providerId === state.selectedModelProviderId
      ? patch.id ?? state.selectedModelProviderId
      : state.selectedModelProviderId,
  };
}

function deleteProviderState(state: ConfigManagerState, providerId: string): ConfigManagerState {
  const providers = state.providers.filter(provider => provider.id !== providerId);
  const selectedProvider = providers[0];
  return {
    providers,
    selectedProviderId: selectedProvider?.id,
    selectedModelProviderId: undefined,
    selectedModelId: undefined,
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
  return {
    providers,
    selectedProviderId: undefined,
    selectedModelProviderId: providerId,
    selectedModelId: modelId,
    dirty: true,
  };
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
    selectedModelProviderId: state.selectedModelProviderId,
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
    selectedModelProviderId: undefined,
    selectedModelId: undefined,
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
    selectedProviderId: undefined,
    selectedModelProviderId: providerId,
    selectedModelId: duplicateId,
    dirty: true,
  };
}

function normalizeImportedModels(
  models: Array<Partial<ModelConfig> & Pick<ModelConfig, 'id' | 'name'>>
): ModelConfig[] {
  return models.map(model => {
    const { contextWindowTokens: _legacyContextWindowTokens, ...modelWithoutLegacyContext } = model as typeof model & {
      contextWindowTokens?: unknown;
    };
    const maxOutputTokens = model.maxOutputTokens ?? 4096;
    const maxInputTokens = model.maxInputTokens ?? 128000;
    return {
      ...modelWithoutLegacyContext,
      id: model.id,
      name: model.name,
      maxInputTokens,
      maxOutputTokens,
      supportsToolCalling: model.supportsToolCalling ?? true,
    };
  });
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
