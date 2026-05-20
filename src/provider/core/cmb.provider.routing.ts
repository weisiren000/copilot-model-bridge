import { getProviders } from '../config/cmb.provider.settings';
import { ProviderConfig } from '../../types';

const ID_SEP = '::';

export function resolveProvider(compoundId: string): { provider: ProviderConfig | undefined; modelId: string } {
  const sepIdx = compoundId.indexOf(ID_SEP);
  if (sepIdx === -1) {
    return { provider: undefined, modelId: compoundId };
  }
  const providerId = compoundId.substring(0, sepIdx);
  const modelId = compoundId.substring(sepIdx + ID_SEP.length);
  const provider = getProviders().find(candidate => candidate.id === providerId);
  return { provider, modelId };
}
