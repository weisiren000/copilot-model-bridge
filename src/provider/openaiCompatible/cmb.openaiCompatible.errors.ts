const TEMPORARY_HTTP_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export function createHttpError(
  requestUrl: string,
  status: number,
  responseText: string
): Error {
  if (TEMPORARY_HTTP_STATUSES.has(status)) {
    return new Error(`上游模型服务暂时不可用 (HTTP ${status})，请稍后重试。`);
  }
  return new Error(`API request to ${requestUrl} failed with status ${status}: ${responseText}`);
}

export function createStreamFailureError(message: string): Error {
  if (isTemporaryUpstreamMessage(message)) {
    return new Error('上游模型服务当前繁忙，请稍后重试。');
  }
  return new Error(message);
}

function isTemporaryUpstreamMessage(message: string): boolean {
  return /overloaded|rate limit|too many requests|temporarily unavailable|timeout|timed out/i
    .test(message);
}
