import { ModelConfig, ProviderConfig, ReasoningLevel } from './types';

export interface ConfigValidationIssue {
  severity: 'error' | 'warning';
  message: string;
  providerId?: string;
  modelId?: string;
}

export function updateProvider(
  providers: readonly ProviderConfig[],
  providerId: string,
  patch: Partial<Omit<ProviderConfig, 'models'>>
): ProviderConfig[] {
  return providers.map(provider => (
    provider.id === providerId
      ? { ...provider, ...removeUndefinedValues(patch) }
      : provider
  ));
}

export function updateModel(
  providers: readonly ProviderConfig[],
  providerId: string,
  modelId: string,
  patch: Partial<ModelConfig>
): ProviderConfig[] {
  return providers.map(provider => {
    if (provider.id !== providerId) {
      return provider;
    }

    return {
      ...provider,
      models: provider.models.map(model => (
        model.id === modelId
          ? { ...model, ...removeUndefinedValues(patch) }
          : model
      )),
    };
  });
}

export function duplicateModel(
  providers: readonly ProviderConfig[],
  providerId: string,
  sourceModelId: string,
  duplicateId: string,
  duplicateName: string
): ProviderConfig[] {
  return providers.map(provider => {
    if (provider.id !== providerId) {
      return provider;
    }

    const source = provider.models.find(model => model.id === sourceModelId);
    if (!source) {
      return provider;
    }

    return {
      ...provider,
      models: [
        ...provider.models,
        { ...source, id: duplicateId, name: duplicateName },
      ],
    };
  });
}

export function importModels(
  providers: readonly ProviderConfig[],
  providerId: string,
  models: readonly ModelConfig[]
): ProviderConfig[] {
  return providers.map(provider => {
    if (provider.id !== providerId) {
      return provider;
    }

    const existingIds = new Set(provider.models.map(model => model.id));
    const imported = models.filter(model => !existingIds.has(model.id));
    return { ...provider, models: [...provider.models, ...imported] };
  });
}

export function validateProviderConfig(providers: readonly ProviderConfig[]): ConfigValidationIssue[] {
  const issues: ConfigValidationIssue[] = [];

  for (const provider of providers) {
    addBaseUrlIssue(issues, provider);
    addDuplicateModelIssues(issues, provider);
    for (const model of provider.models) {
      addReasoningIssues(issues, provider, model);
      addAttachmentPolicyIssues(issues, provider, model);
    }
  }

  return issues;
}

function addBaseUrlIssue(issues: ConfigValidationIssue[], provider: ProviderConfig): void {
  try {
    new URL(provider.baseUrl);
  } catch {
    issues.push({
      severity: 'error',
      providerId: provider.id,
      message: `Provider "${provider.displayName}" has an invalid base URL.`,
    });
  }
}

function addDuplicateModelIssues(issues: ConfigValidationIssue[], provider: ProviderConfig): void {
  const seen = new Set<string>();
  for (const model of provider.models) {
    if (seen.has(model.id)) {
      issues.push({
        severity: 'error',
        providerId: provider.id,
        modelId: model.id,
        message: `Provider "${provider.displayName}" has duplicate model id "${model.id}".`,
      });
    }
    seen.add(model.id);
  }
}

function addReasoningIssues(
  issues: ConfigValidationIssue[],
  provider: ProviderConfig,
  model: ModelConfig
): void {
  if (!model.supportsReasoning) {
    if (model.supportedReasoningLevels?.length || model.defaultReasoningLevel) {
      issues.push({
        severity: 'warning',
        providerId: provider.id,
        modelId: model.id,
        message: `Model "${model.name}" has reasoning settings but supportsReasoning is disabled.`,
      });
    }
    return;
  }

  if (
    model.defaultReasoningLevel
    && model.supportedReasoningLevels?.length
    && !model.supportedReasoningLevels.includes(model.defaultReasoningLevel as ReasoningLevel)
  ) {
    issues.push({
      severity: 'error',
      providerId: provider.id,
      modelId: model.id,
      message: `Model "${model.name}" default reasoning level is not in supportedReasoningLevels.`,
    });
  }
}

function addAttachmentPolicyIssues(
  issues: ConfigValidationIssue[],
  provider: ProviderConfig,
  model: ModelConfig
): void {
  if (model.supportsVideo) {
    issues.push({
      severity: 'warning',
      providerId: provider.id,
      modelId: model.id,
      message: `Model "${model.name}" declares video support, but video request conversion is currently rejected.`,
    });
  }

  if (model.supportsFileInput) {
    issues.push({
      severity: 'warning',
      providerId: provider.id,
      modelId: model.id,
      message: `Model "${model.name}" declares generic file input, but non-text binary request conversion is currently rejected.`,
    });
  }
}

function removeUndefinedValues<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as Partial<T>;
}
