import { ANTHROPIC_REDACTED_THINKING_MIME } from './cmb.anthropic.constants';

export type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicImageBlock
  | AnthropicDocumentBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock
  | AnthropicRedactedThinkingBlock;

export interface AnthropicCacheControl {
  type: 'ephemeral';
  ttl?: '5m' | '1h';
}

export interface AnthropicTextBlock {
  type: 'text';
  text: string;
  cache_control?: AnthropicCacheControl;
}

export interface AnthropicImageBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    data: string;
  };
  cache_control?: AnthropicCacheControl;
}

export interface AnthropicDocumentBlock {
  type: 'document';
  source:
    | {
      type: 'base64';
      media_type: 'application/pdf';
      data: string;
    }
    | {
      type: 'text';
      media_type: 'text/plain' | 'application/json';
      data: string;
    };
  citations?: { enabled: boolean };
  cache_control?: AnthropicCacheControl;
  context?: string;
  title?: string;
}

export interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

export interface AnthropicToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | AnthropicContentBlock[];
  is_error?: boolean;
}

export interface AnthropicRedactedThinkingBlock {
  type: 'redacted_thinking';
  data: string;
}

export interface AnthropicAttachmentPolicy {
  supportsVideo?: boolean;
  supportsFileInput?: boolean;
  enableDocumentCitations?: boolean;
}

const COPILOT_METADATA_MIME_TYPES = new Set([
  'cache_control',
  'stateful_marker',
  'thinking',
  'context_management',
  'phase_data',
  'response_output_message_id',
  'application/x-deepseek-reasoning',
  'application/x-gemini-thought-signature',
  'application/x-anthropic-thinking-signature',
]);

const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

export function createAnthropicTextBlock(text: string): AnthropicTextBlock {
  return { type: 'text', text };
}

export function createAnthropicDataPartContent(
  data: Uint8Array,
  mimeType: string | undefined,
  policy: AnthropicAttachmentPolicy
): AnthropicContentBlock[] {
  const normalizedMime = normalizeMimeType(mimeType);

  if (COPILOT_METADATA_MIME_TYPES.has(normalizedMime)) {
    return [];
  }

  if (normalizedMime === ANTHROPIC_REDACTED_THINKING_MIME) {
    const redacted = decodeRedactedThinkingData(data);
    return redacted ? [redacted] : [];
  }

  if (SUPPORTED_IMAGE_MIME_TYPES.has(normalizedMime)) {
    return [createAnthropicImageBlock(data, normalizedMime as AnthropicImageBlock['source']['media_type'])];
  }

  if (normalizedMime.startsWith('image/')) {
    throw new Error(`Image MIME type "${normalizedMime}" is not supported by Anthropic Messages API.`);
  }

  if (normalizedMime === 'application/pdf') {
    return [withDocumentCitations({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: Buffer.from(data).toString('base64'),
      },
    }, policy)];
  }

  if (normalizedMime === 'application/json' || normalizedMime.startsWith('text/')) {
    return [withDocumentCitations({
      type: 'document',
      source: {
        type: 'text',
        media_type: normalizedMime === 'application/json' ? 'application/json' : 'text/plain',
        data: new TextDecoder().decode(data),
      },
    }, policy)];
  }

  if (normalizedMime.startsWith('video/')) {
    throw new Error('Video attachments are not supported by Anthropic Messages API.');
  }

  if (normalizedMime.startsWith('audio/')) {
    throw new Error('Audio attachments are not supported by Anthropic Messages API.');
  }

  if (policy.supportsFileInput) {
    throw new Error(`File MIME type "${normalizedMime}" is not supported by Anthropic Messages API.`);
  }

  throw new Error(`Unsupported attachment MIME type "${normalizedMime}".`);
}

export function buildAnthropicContent(
  text: string,
  parts: AnthropicContentBlock[]
): AnthropicContentBlock[] {
  const content: AnthropicContentBlock[] = [];
  if (text) {
    content.push(createAnthropicTextBlock(text));
  }
  content.push(...parts);
  return content;
}

export function hasAnthropicContent(text: string, parts: AnthropicContentBlock[]): boolean {
  return text.length > 0 || parts.length > 0;
}

function createAnthropicImageBlock(
  data: Uint8Array,
  mimeType: AnthropicImageBlock['source']['media_type']
): AnthropicImageBlock {
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: mimeType,
      data: Buffer.from(data).toString('base64'),
    },
  };
}

function withDocumentCitations(
  block: AnthropicDocumentBlock,
  policy: AnthropicAttachmentPolicy
): AnthropicDocumentBlock {
  if (!policy.enableDocumentCitations) {
    return block;
  }
  return { ...block, citations: { enabled: true } };
}

function normalizeMimeType(mimeType: string | undefined): string {
  const normalized = mimeType?.split(';', 1)[0]?.trim().toLowerCase();
  return normalized || 'application/octet-stream';
}

function decodeRedactedThinkingData(data: Uint8Array): AnthropicRedactedThinkingBlock | undefined {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(data)) as { data?: unknown };
    return typeof parsed.data === 'string'
      ? { type: 'redacted_thinking', data: parsed.data }
      : undefined;
  } catch {
    return undefined;
  }
}
