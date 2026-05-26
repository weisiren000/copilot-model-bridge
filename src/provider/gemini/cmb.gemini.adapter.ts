/**
 * Gemini 专用适配，集中处理 Gemini OpenAI-compatible 端点和通用
 * OpenAI 协议之间的差异。
 *
 * 参考：
 * - https://ai.google.dev/gemini-api/docs/openai
 * - https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/function-calling
 */

import { ProviderConfig } from '../../types';

const SUPPORTED_SCHEMA_KEYS = new Set([
  'description',
  'enum',
  'format',
  'items',
  'maximum',
  'maxItems',
  'minimum',
  'minItems',
  'nullable',
  'properties',
  'required',
  'type',
]);
const SUPPORTED_STRING_FORMATS = new Set(['date', 'date-time', 'duration', 'time']);
const VALID_SCHEMA_TYPES = new Set(['array', 'boolean', 'integer', 'number', 'object', 'string']);

export interface GeminiToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: unknown;
  };
}

export interface GeminiRequestPatchContext {
  tools?: GeminiToolDefinition[];
  includeThoughts?: boolean;
}

export interface GeminiRequestPatch {
  tools?: GeminiToolDefinition[];
  extra_body?: {
    google: {
      thinking_config: {
        include_thoughts: true;
      };
      thought_tag_marker: 'think';
    };
  };
}

export function isGeminiModelId(modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  return normalized.startsWith('gemini-')
    || normalized.startsWith('models/gemini-')
    || normalized.includes('/gemini-');
}

export function isGeminiRequest(
  provider: Pick<ProviderConfig, 'id' | 'baseUrl'>,
  modelId: string
): boolean {
  return isGeminiProvider(provider) || isGeminiModelId(modelId);
}

export function resolveGeminiOpenAICompatibleUrl(
  provider: Pick<ProviderConfig, 'id' | 'baseUrl'>,
  endpointPath: string
): string {
  const baseUrl = trimTrailingSlash(provider.baseUrl);
  if (!isOfficialGoogleGeminiHost(provider.baseUrl)) {
    return `${baseUrl}/${trimSlashes(endpointPath)}`;
  }

  const url = new URL(baseUrl);
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[segments.length - 1] !== 'openai') {
    segments.push('openai');
  }
  url.pathname = `/${segments.join('/')}/${trimSlashes(endpointPath)}`;
  return url.toString().replace(/\/$/, '');
}

export function buildGeminiRequestPatch(
  context: GeminiRequestPatchContext
): GeminiRequestPatch {
  const patch: GeminiRequestPatch = {};
  if (context.tools && context.tools.length > 0) {
    patch.tools = context.tools.map(tool => ({
      ...tool,
      function: {
        ...tool.function,
        parameters: sanitizeGeminiToolSchema(tool.function.parameters),
      },
    }));
  }

  if (context.includeThoughts) {
    patch.extra_body = {
      google: {
        thinking_config: {
          include_thoughts: true,
        },
        thought_tag_marker: 'think',
      },
    };
  }

  return patch;
}

export function sanitizeGeminiToolSchema(schema: unknown): unknown {
  if (!isRecord(schema)) {
    return { type: 'object', properties: {} };
  }

  const sanitized = sanitizeSchemaRecord(schema);
  if (!sanitized.type) {
    sanitized.type = 'object';
  }
  if (sanitized.type === 'object' && !isRecord(sanitized.properties)) {
    sanitized.properties = {};
  }
  return sanitized;
}

function isGeminiProvider(provider: Pick<ProviderConfig, 'id' | 'baseUrl'>): boolean {
  if (provider.id.toLowerCase().includes('gemini')) {
    return true;
  }
  try {
    const hostname = new URL(provider.baseUrl).hostname.toLowerCase();
    return hostname === 'generativelanguage.googleapis.com'
      || hostname.endsWith('.generativelanguage.googleapis.com')
      || hostname === 'aiplatform.googleapis.com'
      || hostname.endsWith('.aiplatform.googleapis.com');
  } catch {
    return false;
  }
}

function isOfficialGoogleGeminiHost(baseUrl: string): boolean {
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    return hostname === 'generativelanguage.googleapis.com'
      || hostname.endsWith('.generativelanguage.googleapis.com');
  } catch {
    return false;
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '');
}

function sanitizeSchemaValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeSchemaValue).filter(item => item !== undefined);
  }
  if (!isRecord(value)) {
    return value;
  }
  return sanitizeSchemaRecord(value);
}

function sanitizeSchemaRecord(schema: Record<string, unknown>): Record<string, unknown> {
  const selectedSchema = selectCompositeSchema(schema);
  const result: Record<string, unknown> = {};
  const properties = isRecord(selectedSchema.properties)
    ? sanitizeProperties(selectedSchema.properties)
    : undefined;

  for (const [key, value] of Object.entries(selectedSchema)) {
    if (!SUPPORTED_SCHEMA_KEYS.has(key)) {
      continue;
    }

    if (key === 'type') {
      const type = normalizeSchemaType(value);
      if (type !== undefined) {
        result.type = type;
      }
      continue;
    }

    if (key === 'properties' && isRecord(value)) {
      result.properties = properties;
      continue;
    }

    if (key === 'items') {
      result.items = sanitizeSchemaItems(value);
      continue;
    }

    if (key === 'required' && Array.isArray(value)) {
      result.required = sanitizeRequiredFields(value, properties);
      continue;
    }

    if (key === 'enum' && Array.isArray(value)) {
      const enumValues = value.filter(item => typeof item === 'string');
      if (enumValues.length > 0) {
        result.enum = enumValues;
      }
      continue;
    }

    if (key === 'format') {
      if (typeof value === 'string' && SUPPORTED_STRING_FORMATS.has(value)) {
        result.format = value;
      }
      continue;
    }

    result[key] = sanitizeSchemaValue(value);
  }

  if (result.type === 'object' && !isRecord(result.properties)) {
    result.properties = {};
  }
  return result;
}

function sanitizeSchemaItems(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return sanitizeSchemaValue(value);
  }

  const selected = value.find(isRecord);
  return sanitizeSchemaValue(selected ?? {});
}

function selectCompositeSchema(schema: Record<string, unknown>): Record<string, unknown> {
  for (const key of ['anyOf', 'oneOf', 'allOf']) {
    const variants = schema[key];
    if (!Array.isArray(variants)) {
      continue;
    }
    const selected = variants.find(item => isRecord(item) && item.type !== 'null');
    if (isRecord(selected)) {
      return selected;
    }
  }
  return schema;
}

function sanitizeProperties(properties: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(properties)) {
    const sanitized = sanitizeSchemaValue(value);
    if (sanitized !== undefined) {
      result[name] = sanitized;
    }
  }
  return result;
}

function sanitizeRequiredFields(value: unknown[], properties: unknown): string[] {
  const allowed = isRecord(properties) ? new Set(Object.keys(properties)) : undefined;
  return value.filter((item): item is string => (
    typeof item === 'string' && (!allowed || allowed.has(item))
  ));
}

function normalizeSchemaType(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return VALID_SCHEMA_TYPES.has(value) ? value : undefined;
  }
  if (!Array.isArray(value)) {
    return undefined;
  }

  const selected = value.find(item => typeof item === 'string' && item !== 'null');
  return VALID_SCHEMA_TYPES.has(selected as string) ? selected as string : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
