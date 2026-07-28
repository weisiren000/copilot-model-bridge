import { DEFAULT_IMAGE_DETAIL, ImageDetail } from '../../types';

const ASCII_CHARS_PER_TOKEN = 4;
const OTHER_UNICODE_CHARS_PER_TOKEN = 2;
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
  let asciiCharacters = 0;
  let cjkCharacters = 0;
  let otherUnicodeCharacters = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f) {
      asciiCharacters += 1;
    } else if (isCjkCodePoint(codePoint)) {
      cjkCharacters += 1;
    } else {
      otherUnicodeCharacters += 1;
    }
  }
  return Math.ceil(
    asciiCharacters / ASCII_CHARS_PER_TOKEN
      + cjkCharacters
      + otherUnicodeCharacters / OTHER_UNICODE_CHARS_PER_TOKEN
  );
}

export function estimateChatMessageTokens(
  parts: readonly TokenEstimatePart[],
  imageDetail: ImageDetail = DEFAULT_IMAGE_DETAIL
): number {
  return parts.reduce((total, part) => total + estimatePartTokens(part, imageDetail), 0);
}

export function estimateSerializedTokens(value: unknown): number {
  return estimateStringTokens(safeStringify(value));
}

export function estimateImageTokens(
  data: Uint8Array,
  mimeType: string | undefined,
  detail: ImageDetail = DEFAULT_IMAGE_DETAIL
): number {
  if (detail === 'low') {
    return IMAGE_TOKEN_ESTIMATE;
  }
  const dimensions = readImageDimensions(data, mimeType);
  if (!dimensions) {
    return Math.max(IMAGE_TOKEN_ESTIMATE, Math.ceil(data.byteLength / 2));
  }
  const horizontalPatches = Math.ceil(dimensions.width / 32);
  const verticalPatches = Math.ceil(dimensions.height / 32);
  return Math.max(IMAGE_TOKEN_ESTIMATE, horizontalPatches * verticalPatches);
}

function estimatePartTokens(part: TokenEstimatePart, imageDetail: ImageDetail): number {
  switch (part.type) {
    case 'text':
      return estimateStringTokens(part.text);
    case 'image':
      return Math.max(IMAGE_TOKEN_ESTIMATE, Math.ceil(part.byteLength / 2));
    case 'data':
      return estimateDataPartTokens(part.data, part.mimeType, imageDetail);
    case 'toolCall':
      return estimateStringTokens(`${part.name} ${safeStringify(part.input)}`);
    case 'toolResult':
      return estimateStringTokens(part.callId)
        + estimateChatMessageTokens(part.content, imageDetail);
  }
}

function estimateDataPartTokens(
  data: Uint8Array,
  mimeType: string | undefined,
  imageDetail: ImageDetail
): number {
  const normalizedMime = normalizeMimeType(mimeType);
  if (COPILOT_METADATA_MIME_TYPES.has(normalizedMime)) {
    return 0;
  }
  if (normalizedMime.startsWith('image/')) {
    return estimateImageTokens(data, normalizedMime, imageDetail);
  }
  if (normalizedMime.startsWith('text/') || normalizedMime === 'application/json') {
    return estimateStringTokens(new TextDecoder().decode(data));
  }
  return estimateStringTokens(`[${normalizedMime}; ${data.byteLength} bytes]`);
}

function isCjkCodePoint(codePoint: number): boolean {
  return (codePoint >= 0x3400 && codePoint <= 0x4dbf)
    || (codePoint >= 0x4e00 && codePoint <= 0x9fff)
    || (codePoint >= 0xf900 && codePoint <= 0xfaff)
    || (codePoint >= 0x20000 && codePoint <= 0x323af);
}

interface ImageDimensions {
  width: number;
  height: number;
}

function readImageDimensions(data: Uint8Array, mimeType: string | undefined): ImageDimensions | undefined {
  const normalizedMime = normalizeMimeType(mimeType);
  if (normalizedMime === 'image/png') {
    return readPngDimensions(data);
  }
  if (normalizedMime === 'image/gif') {
    return readGifDimensions(data);
  }
  if (normalizedMime === 'image/jpeg' || normalizedMime === 'image/jpg') {
    return readJpegDimensions(data);
  }
  if (normalizedMime === 'image/webp') {
    return readWebpDimensions(data);
  }
  return undefined;
}

function readPngDimensions(data: Uint8Array): ImageDimensions | undefined {
  if (data.length < 24 || !matchesBytes(data, [137, 80, 78, 71, 13, 10, 26, 10])) {
    return undefined;
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return createDimensions(view.getUint32(16), view.getUint32(20));
}

function readGifDimensions(data: Uint8Array): ImageDimensions | undefined {
  if (data.length < 10 || !matchesAscii(data, 'GIF')) {
    return undefined;
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return createDimensions(view.getUint16(6, true), view.getUint16(8, true));
}

function readJpegDimensions(data: Uint8Array): ImageDimensions | undefined {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) {
    return undefined;
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let offset = 2; offset + 8 < data.length;) {
    if (data[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = data[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) {
      continue;
    }
    if (offset + 2 > data.length) {
      return undefined;
    }
    const segmentLength = view.getUint16(offset);
    if (segmentLength < 2 || offset + segmentLength > data.length) {
      return undefined;
    }
    if (isJpegStartOfFrame(marker) && offset + 7 < data.length) {
      return createDimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
    }
    offset += segmentLength;
  }
  return undefined;
}

function readWebpDimensions(data: Uint8Array): ImageDimensions | undefined {
  if (data.length < 30 || !matchesAscii(data, 'RIFF') || !matchesAscii(data.subarray(8), 'WEBP')) {
    return undefined;
  }
  if (matchesAscii(data.subarray(12), 'VP8X')) {
    const width = readUint24LittleEndian(data, 24) + 1;
    const height = readUint24LittleEndian(data, 27) + 1;
    return createDimensions(width, height);
  }
  return undefined;
}

function isJpegStartOfFrame(marker: number): boolean {
  return (marker >= 0xc0 && marker <= 0xc3)
    || (marker >= 0xc5 && marker <= 0xc7)
    || (marker >= 0xc9 && marker <= 0xcb)
    || (marker >= 0xcd && marker <= 0xcf);
}

function readUint24LittleEndian(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16);
}

function createDimensions(width: number, height: number): ImageDimensions | undefined {
  return width > 0 && height > 0 ? { width, height } : undefined;
}

function matchesBytes(data: Uint8Array, expected: number[]): boolean {
  return expected.every((value, index) => data[index] === value);
}

function matchesAscii(data: Uint8Array, expected: string): boolean {
  return [...expected].every((character, index) => data[index] === character.charCodeAt(0));
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
