import { ProviderConfig } from './types';

export const CONFIG_SECTION = 'copilot-model-bridge';
export const LEGACY_CONFIG_SECTION = 'openai-compat-provider';

export function selectConfiguredProviders(
  providers: ProviderConfig[] | undefined,
  legacyProviders: ProviderConfig[] | undefined
): ProviderConfig[] {
  return providers ?? legacyProviders ?? [];
}
