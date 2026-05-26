import http from 'node:http';
import https from 'node:https';
import { Readable } from 'node:stream';

export function postStreaming(
  requestUrl: string,
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal
): Promise<Response> {
  const url = new URL(requestUrl);
  const payload = JSON.stringify(body);
  const transport = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const request = transport.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(payload).toString(),
      },
    }, response => {
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        appendResponseHeader(responseHeaders, name, value);
      }

      resolve(new Response(Readable.toWeb(response) as ReadableStream<Uint8Array>, {
        status: response.statusCode ?? 500,
        statusText: response.statusMessage,
        headers: responseHeaders,
      }));
    });

    const abort = () => {
      request.destroy(Object.assign(new Error('The operation was aborted.'), {
        name: 'AbortError',
      }));
    };

    if (signal.aborted) {
      abort();
      return;
    }

    signal.addEventListener('abort', abort, { once: true });
    request.on('error', reject);
    request.on('close', () => signal.removeEventListener('abort', abort));
    request.end(payload);
  });
}

export const postStreamingChatCompletion = postStreaming;

function appendResponseHeader(
  headers: Headers,
  name: string,
  value: string | string[] | number | undefined
): void {
  if (value === undefined) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      headers.append(name, item);
    }
    return;
  }

  headers.append(name, String(value));
}
