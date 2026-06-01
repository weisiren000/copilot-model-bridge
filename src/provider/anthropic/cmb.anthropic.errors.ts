interface AnthropicErrorPayload {
  error?: {
    type?: string;
    message?: string;
    request_id?: string;
  };
  request_id?: string;
}

export function createAnthropicHttpError(
  requestUrl: string,
  status: number,
  responseText: string,
  headers?: Headers
): Error {
  const payload = parseAnthropicErrorPayload(responseText);
  const errorType = payload?.error?.type;
  const message = payload?.error?.message ?? responseText;
  const requestId = payload?.error?.request_id ?? payload?.request_id ?? readRequestId(headers);
  const details = [
    `HTTP ${status}`,
    errorType,
    requestId ? `request_id=${requestId}` : undefined,
  ].filter(Boolean).join(', ');
  return new Error(`Anthropic API request failed (${details}) for ${requestUrl}: ${message}`);
}

function parseAnthropicErrorPayload(responseText: string): AnthropicErrorPayload | undefined {
  try {
    const payload = JSON.parse(responseText) as AnthropicErrorPayload;
    return payload && typeof payload === 'object' ? payload : undefined;
  } catch {
    return undefined;
  }
}

function readRequestId(headers: Headers | undefined): string | undefined {
  return headers?.get('request-id') ?? headers?.get('anthropic-request-id') ?? undefined;
}
