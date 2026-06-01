import { ProviderConfig } from '../../types';
import { PRODUCT_NAME, USER_AGENT } from '../cmb.branding';

const OPENROUTER_APP_URL = 'https://github.com/weisiren000/copilot-model-bridge';
const OPENROUTER_APP_TITLE = PRODUCT_NAME;

export function buildChatRequestHeaders(
  provider: Pick<ProviderConfig, 'baseUrl' | 'apiKey'>
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
    'User-Agent': USER_AGENT,
  };

  if (provider.apiKey) {
    headers['Authorization'] = `Bearer ${provider.apiKey}`;
  }

  if (isOpenRouterBaseUrl(provider.baseUrl)) {
    headers['HTTP-Referer'] = OPENROUTER_APP_URL;
    headers['X-OpenRouter-Title'] = OPENROUTER_APP_TITLE;
  }

  return headers;
}

export function isOpenRouterBaseUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return url.hostname === 'openrouter.ai' || url.hostname.endsWith('.openrouter.ai');
  } catch {
    return false;
  }
}
