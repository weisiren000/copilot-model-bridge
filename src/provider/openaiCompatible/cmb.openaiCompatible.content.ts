export interface OpenAITextContentPart {
  type: 'text';
  text: string;
}

export interface OpenAIImageContentPart {
  type: 'image_url';
  image_url: {
    url: string;
  };
}

export type OpenAIContentPart = OpenAITextContentPart | OpenAIImageContentPart;

export type OpenAIContent = string | null | OpenAIContentPart[];

export interface AttachmentPolicy {
  supportsVideo?: boolean;
  supportsFileInput?: boolean;
}

const COPILOT_METADATA_MIME_TYPES = new Set([
  'cache_control',
  'stateful_marker',
  'thinking',
  'context_management',
  'phase_data',
  'response_output_message_id',
  'application/x-deepseek-reasoning',
]);

export function createOpenAIImagePart(data: Uint8Array, mimeType: string): OpenAIImageContentPart {
  return {
    type: 'image_url',
    image_url: {
      url: `data:${mimeType};base64,${Buffer.from(data).toString('base64')}`,
    },
  };
}

export function createOpenAITextPart(text: string): OpenAITextContentPart {
  return { type: 'text', text };
}

export function createOpenAIDataPartContent(
  data: Uint8Array,
  mimeType: string | undefined,
  policy: AttachmentPolicy
): OpenAIContentPart[] {
  const normalizedMime = normalizeMimeType(mimeType);

  if (COPILOT_METADATA_MIME_TYPES.has(normalizedMime)) {
    return [];
  }

  if (normalizedMime.startsWith('image/')) {
    return [createOpenAIImagePart(data, normalizedMime)];
  }

  if (normalizedMime.startsWith('video/')) {
    if (policy.supportsVideo) {
      throw new Error(
        `Video attachments are not yet supported by OpenAI-compatible request conversion. MIME type: ${normalizedMime}.`
      );
    }
    throw new Error(
      `Video attachments are not supported by this model. MIME type: ${normalizedMime}.`
    );
  }

  if (normalizedMime.startsWith('text/') || normalizedMime === 'application/json') {
    return [createOpenAITextPart(new TextDecoder().decode(data))];
  }

  if (policy.supportsFileInput) {
    throw new Error(
      `File attachments are not yet supported by OpenAI-compatible request conversion. MIME type: ${normalizedMime}.`
    );
  }

  throw new Error(`Unsupported attachment MIME type "${normalizedMime}".`);
}

export function buildOpenAIContent(
  text: string,
  parts: OpenAIContentPart[]
): OpenAIContent {
  if (parts.length === 0) {
    return text || null;
  }

  const content: OpenAIContentPart[] = [];
  if (text) {
    content.push(createOpenAITextPart(text));
  }
  content.push(...parts);
  return content;
}

function normalizeMimeType(mimeType: string | undefined): string {
  const normalized = mimeType?.split(';', 1)[0]?.trim().toLowerCase();
  return normalized || 'application/octet-stream';
}
