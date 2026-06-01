/**
 * openaiModels.ts
 *
 * OpenAI 兼容的模型列表获取逻辑。
 *
 * 标准 OpenAI 协议（包括 DeepSeek、NVIDIA NIM、OpenRouter、Ollama OpenAI mode、
 * LM Studio 等）暴露 `GET {baseUrl}/models` 端点，返回：
 *   { object: "list", data: [{ id: "...", ... }, ...] }
 *
 * 这里只依赖 Node.js http/https，不依赖 vscode，便于单元测试。
 */

import http from 'node:http';
import https from 'node:https';
import { USER_AGENT } from '../cmb.branding';

const DEFAULT_TIMEOUT_MS = 12_000;

export interface FetchModelListOptions {
  baseUrl: string;
  apiKey?: string;
  /** 单次请求超时（毫秒），默认 12 秒 */
  timeoutMs?: number;
  /** 可选的 AbortSignal，调用方可取消 */
  signal?: AbortSignal;
}

export interface FetchModelListResult {
  ok: boolean;
  models: string[];
  error?: string;
}

/**
 * 调用 GET {baseUrl}/models 获取模型列表。
 * 失败时返回 ok=false + error，不抛异常。
 */
export async function fetchOpenAIModelList(
  options: FetchModelListOptions
): Promise<FetchModelListResult> {
  const url = buildModelsUrl(options.baseUrl);
  if (!url) {
    return { ok: false, models: [], error: 'Base URL 不是合法的 URL' };
  }

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'User-Agent': USER_AGENT,
  };
  if (options.apiKey && options.apiKey.trim()) {
    headers['Authorization'] = `Bearer ${options.apiKey.trim()}`;
  }

  try {
    const response = await fetchJson(url, headers, options);
    return parseModelsResponse(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, models: [], error: message };
  }
}

function buildModelsUrl(baseUrl: string): URL | undefined {
  try {
    const trimmed = baseUrl.replace(/\/+$/, '');
    return new URL(`${trimmed}/models`);
  } catch {
    return undefined;
  }
}

function fetchJson(
  url: URL,
  headers: Record<string, string>,
  options: FetchModelListOptions
): Promise<unknown> {
  const transport = url.protocol === 'https:' ? https : http;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const request = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          handleResponse(response.statusCode ?? 0, Buffer.concat(chunks), resolve, reject);
        });
        response.on('error', reject);
      }
    );

    const handleAbort = () => {
      request.destroy(new Error('请求已取消'));
    };
    if (options.signal) {
      if (options.signal.aborted) {
        handleAbort();
        return;
      }
      options.signal.addEventListener('abort', handleAbort, { once: true });
      request.on('close', () => options.signal?.removeEventListener('abort', handleAbort));
    }

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`请求超时 (${timeoutMs}ms)`));
    });
    request.on('error', reject);
    request.end();
  });
}

function handleResponse(
  statusCode: number,
  body: Buffer,
  resolve: (value: unknown) => void,
  reject: (reason: Error) => void
): void {
  const text = body.toString('utf8');
  if (statusCode < 200 || statusCode >= 300) {
    reject(new Error(`HTTP ${statusCode}: ${truncate(text, 200)}`));
    return;
  }
  try {
    resolve(JSON.parse(text));
  } catch {
    reject(new Error('响应不是合法的 JSON'));
  }
}

function parseModelsResponse(payload: unknown): FetchModelListResult {
  const ids = extractModelIds(payload);
  if (ids.length === 0) {
    return { ok: true, models: [], error: '响应中没有模型条目' };
  }
  return { ok: true, models: dedupeAndSort(ids) };
}

function extractModelIds(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const ids: string[] = [];
  for (const item of data) {
    const id = readModelId(item);
    if (id) ids.push(id);
  }
  return ids;
}

function readModelId(item: unknown): string | undefined {
  if (!item || typeof item !== 'object') return undefined;
  const id = (item as { id?: unknown }).id;
  if (typeof id !== 'string') return undefined;
  const trimmed = id.trim();
  return trimmed || undefined;
}

function dedupeAndSort(ids: string[]): string[] {
  return Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b));
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
