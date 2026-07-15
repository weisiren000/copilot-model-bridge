const APPROX_CHARS_PER_TOKEN = 4;
const IMAGE_TOKEN_ESTIMATE = 1024;
const COPILOT_METADATA_MIME_TYPES = new Set([
  'cache_control',
  'stateful_marker',
  'thinking',
  'context_management',
  'phase_data',
  'response_output_message_id',
  'usage',
  'application/x-deepseek-reasoning',
]);

export type TokenEstimatePart =
  | { type: 'text'; text: string }
  | { type: 'image'; byteLength: number }
  | { type: 'data'; mimeType?: string; data: Uint8Array }
  | { type: 'toolCall'; name: string; input: unknown }
  | { type: 'toolResult'; callId: string; content: readonly TokenEstimatePart[] };

export function estimateStringTokens(text: string): number {
  return Math.ceil(text.length / APPROX_CHARS_PER_TOKEN);
}

export function estimateChatMessageTokens(parts: readonly TokenEstimatePart[]): number {
  return parts.reduce((total, part) => total + estimatePartTokens(part), 0);
}

function estimatePartTokens(part: TokenEstimatePart): number {
  switch (part.type) {
    case 'text':
      return estimateStringTokens(part.text);
    case 'image':
      return IMAGE_TOKEN_ESTIMATE;
    case 'data':
      return estimateDataPartTokens(part.data, part.mimeType);
    case 'toolCall':
      return estimateStringTokens(`${part.name} ${safeStringify(part.input)}`);
    case 'toolResult':
      return estimateStringTokens(part.callId) + estimateChatMessageTokens(part.content);
  }
}

function estimateDataPartTokens(data: Uint8Array, mimeType: string | undefined): number {
  const normalizedMime = normalizeMimeType(mimeType);
  if (COPILOT_METADATA_MIME_TYPES.has(normalizedMime)) {
    return 0;
  }
  if (normalizedMime.startsWith('image/')) {
    return IMAGE_TOKEN_ESTIMATE;
  }
  if (normalizedMime.startsWith('text/') || normalizedMime === 'application/json') {
    return estimateStringTokens(new TextDecoder().decode(data));
  }
  return estimateStringTokens(`[${normalizedMime}; ${data.byteLength} bytes]`);
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function normalizeMimeType(mimeType: string | undefined): string {
  const normalized = mimeType?.split(';', 1)[0]?.trim().toLowerCase();
  return normalized || 'application/octet-stream';
}
