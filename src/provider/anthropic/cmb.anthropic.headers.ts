import { ProviderConfig } from '../../types';

const DEFAULT_USER_AGENT = 'Copilot Model Bridge';
export const ANTHROPIC_VERSION = '2023-06-01';

export function buildAnthropicRequestHeaders(
  provider: Pick<ProviderConfig, 'apiKey'>
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
    'User-Agent': DEFAULT_USER_AGENT,
    'anthropic-version': ANTHROPIC_VERSION,
  };

  if (provider.apiKey) {
    headers['X-Api-Key'] = provider.apiKey;
  }

  return headers;
}
